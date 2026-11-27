#!/usr/bin/env python3
"""Read-only, bounded native-scanner reconnaissance.

Outputs *derived facts* (function sizes, named call relationships, candidate
scalar literals), never disassembly, code bytes, photographs or binaries.
No candidate scalar is evidence for physical dimensions until its use is
independently understood.
"""
import collections
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys

from capstone import (Cs, CS_ARCH_ARM, CS_MODE_ARM, CS_MODE_THUMB,
                      CS_GRP_JUMP, CS_GRP_CALL, CS_GRP_RET)
from capstone.arm import (ARM_OP_IMM, ARM_OP_MEM, ARM_OP_REG,
                          ARM_REG_PC, ARM_REG_LR)
from elftools.elf.elffile import ELFFile

FOCUS = (
    "TileReader::liveProcess", "TileReader::drawKnownTiles",
    "TileReader::euclideanDist",
    "TileReader::getBoardCorners", "TileReader::computeMatches",
    "TileReader::setBoardDimensions",
    "TileReader::computeBoard", "TileReader::drawGrid",
    "TileReader::removeBoardEdges", "TileReader::getWalls",
    "TileReader::processFromJNI", "TileReader::json",
    "stb::TileBoard::getBoardWalls", "stb::TileBoard::getTileAt",
    "stb::TileBoard::setTileAt", "stb::TileBoard::toJSON",
)
SCANNER_WORDS = ("tilereader::", "tileboard::", "cv::",
                 "getboard", "removeboard", "findcontour", "hough", "opencv")
# These imported symbols establish an available API, not that a particular
# scanner stage invokes it. No callsite attribution is made from imports.
IMAGE_API_WORDS = ("findcontour", "threshold", "cvtcolor", "morphology",
                   "approxpoly", "warp", "perspective", "hough", "blur",
                   "canny", "erode", "dilate", "boundingrect", "contourarea")


def demangle_many(names):
    result = subprocess.run(["c++filt"], input="\n".join(names),
                            capture_output=True, text=True, timeout=20,
                            check=True)
    clean = result.stdout.splitlines()
    if len(clean) != len(names):
        raise ValueError("Demangler returned an unexpected number of names")
    return clean


def normalize(name):
    return name.split("(")[0].strip()



def reachable_decode(code, start_address, thumb):
    """Bounded graph traversal, never a claim of complete native control flow.

    Decode from the actual symbol entry point. Follow direct in-function
    conditional and unconditional branches, but do not treat literal-pool
    bytes after an unconditional branch as executable instructions.
    Calls stay within their caller; indirect branches and jump tables
    remain unresolved. Reject overlapping or out-of-bounds decodes.
    """
    engine = Cs(CS_ARCH_ARM, CS_MODE_THUMB if thumb else CS_MODE_ARM)
    engine.detail = True
    pending = [0]
    visited = {}
    occupied = {}
    reachable_edges = set()
    unresolved = 0
    returns = 0
    rejected = 0
    budget = min(len(code) // 2 + 4, 40000)
    while pending and len(visited) < budget:
        position = pending.pop()
        while 0 <= position < len(code) and position not in visited:
            if position in occupied:
                rejected += 1
                break
            instructions = list(engine.disasm(
                code[position:], start_address + position, count=1))
            if not instructions:
                rejected += 1
                break
            ins = instructions[0]
            if position + ins.size > len(code) or any(
                offset in occupied for offset in range(position, position + ins.size)
            ):
                rejected += 1
                break
            visited[position] = ins
            for offset in range(position, position + ins.size):
                occupied[offset] = position
            next_position = position + ins.size
            mnemonic = ins.mnemonic.split(".")[0]
            is_call = ins.group(CS_GRP_CALL)
            is_jump = ins.group(CS_GRP_JUMP) or mnemonic in (
                "cbz", "cbnz", "tbb", "tbh", "bx")
            if ins.group(CS_GRP_RET):
                returns += 1
                break
            if mnemonic == "bx" and ins.operands and \
               ins.operands[0].type == ARM_OP_REG and \
               ins.operands[0].reg == ARM_REG_LR:
                returns += 1
                break
            if mnemonic == "pop" and any(
                op.type == ARM_OP_REG and op.reg == ARM_REG_PC
                for op in ins.operands
            ):
                returns += 1
                break
            if mnemonic == "mov" and len(ins.operands) >= 2 and \
               ins.operands[0].type == ARM_OP_REG and \
               ins.operands[0].reg == ARM_REG_PC and \
               ins.operands[1].type == ARM_OP_REG and \
               ins.operands[1].reg == ARM_REG_LR:
                returns += 1
                break
            # Register-indirect branches, including switch tables, cannot
            # be followed without data-flow recovery. Never guess targets.
            if mnemonic in ("bx", "tbb", "tbh"):
                unresolved += 1
                break
            if ins.operands and ins.operands[0].type == ARM_OP_REG and (
                ins.operands[0].reg == ARM_REG_PC or
                mnemonic == "pop" and any(
                    operand.type == ARM_OP_REG and operand.reg == ARM_REG_PC
                    for operand in ins.operands)
            ):
                unresolved += 1
                break
            if is_jump and not is_call:
                immediate = next((operand.imm for operand in reversed(ins.operands)
                                  if operand.type == ARM_OP_IMM), None)
                if immediate is not None:
                    target = (int(immediate) & ~1) - start_address
                    if 0 <= target < len(code):
                        reachable_edges.add((position, target))
                        pending.append(target)
                    else:
                        # Can be a tail transfer to another function.
                        unresolved += 1
                else:
                    unresolved += 1
                # A direct unconditional branch ends its basic block.
                # Conditional branches, CBZ and CBNZ also fall through.
                if mnemonic == "b":
                    break
                if mnemonic not in ("cbz", "cbnz") and not mnemonic.startswith("b"):
                    break
            position = next_position
    return {
        "instructions": [visited[offset] for offset in sorted(visited)],
        "reachableBranchEdges": len(reachable_edges),
        "unresolvedTransfers": unresolved,
        "returns": returns,
        "rejectedDecodes": rejected,
        "budgetExhausted": bool(pending and len(visited) >= budget),
    }


def self_test_reachable_decode():
    """Hand-authored synthetic Thumb branches, not original binary bytes."""
    # B +2 halfwords skips an unreachable self-loop and a data halfword.
    skipped = bytes.fromhex("01 e0 fe e7 ad de 70 47")
    result = reachable_decode(skipped, 0x1000, True)
    assert [i.address for i in result["instructions"]] == [0x1000, 0x1006], result
    assert result["reachableBranchEdges"] == 1
    # A conditional branch explores both the fallthrough and its direct target.
    split = bytes.fromhex("00 d1 70 47 70 47")
    result = reachable_decode(split, 0x1000, True)
    assert [i.address for i in result["instructions"]] == [0x1000, 0x1002, 0x1004], result
    assert result["reachableBranchEdges"] == 1
    # Calls do not change which bytes belong to the caller.
    calling = bytes.fromhex("00 f0 00 f8 70 47")
    result = reachable_decode(calling, 0x1000, True)
    assert [i.address for i in result["instructions"]] == [0x1000, 0x1004], result
    assert result["budgetExhausted"] is False
    print("Synthetic native control-flow traversal checks passed")

def main(path):
    source = Path(path)
    if source.stat().st_size > 80_000_000:
        raise ValueError("Native library exceeds analysis size limit")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    with source.open("rb") as handle:
        elf = ELFFile(handle)
        if elf["e_machine"] != "EM_ARM" or elf.elfclass != 32:
            raise ValueError("Expected the original 32-bit ARM native library")
        symbols = []
        for table_name in (".symtab", ".dynsym"):
            table = elf.get_section_by_name(table_name)
            if table is None:
                continue
            for symbol in table.iter_symbols():
                if symbol["st_info"]["type"] != "STT_FUNC":
                    continue
                name = symbol.name
                address = int(symbol["st_value"])
                size = int(symbol["st_size"])
                if name and address and size > 0:
                    symbols.append((address & ~1, address & 1, size, name))
        imported = [symbol.name for symbol in
                    elf.get_section_by_name(".dynsym").iter_symbols()
                    if symbol.name and symbol["st_shndx"] == "SHN_UNDEF" and
                    symbol["st_info"]["type"] == "STT_FUNC"]
        decoded_imports = demangle_many(imported) if imported else []
        image_api_imports = sorted({
            normalize(symbol) for symbol in decoded_imports
            if ("cv::" in symbol.lower() or "opencv" in symbol.lower())
            and any(word in symbol.lower() for word in IMAGE_API_WORDS)
        })
        # Prefer the largest known function at a given entry point.
        unique = {}
        for address, thumb, size, name in symbols:
            old = unique.get(address)
            if old is None or size > old[2]:
                unique[address] = (address, thumb, size, name)
        symbols = list(unique.values())
        names = [entry[3] for entry in symbols]
        resolved = demangle_many(names)
        records = [(address, thumb, size, name, resolved[i])
                   for i, (address, thumb, size, name) in enumerate(symbols)]
        by_address = {address: display for address, _, _, _, display in records}
        focus = [entry for entry in records
                 if any(key in normalize(entry[4]) for key in FOCUS)]
        focus.sort(key=lambda row: row[4])
        if not focus:
            raise ValueError("No original scanner symbols found")
        segments = [segment for segment in elf.iter_segments()
                    if segment["p_type"] == "PT_LOAD" and
                    segment["p_flags"] & 1]
        if not segments:
            raise ValueError("No executable load segment found")
        def read_at(address, length):
            for segment in segments:
                beginning = int(segment["p_vaddr"])
                file_count = int(segment["p_filesz"])
                if beginning <= address and address + length <= beginning + file_count:
                    handle.seek(int(segment["p_offset"]) + address - beginning)
                    return handle.read(length)
            return None

        answers = []
        all_calls = collections.defaultdict(set)
        reachable_calls = collections.defaultdict(set)
        for address, thumb, size, name, display in focus:
            limit = min(size, 65_536)
            code = read_at(address, limit)
            if not code:
                answers.append({"function": normalize(display),
                                "bytes": size, "inspection": "not mapped"})
                continue
            parser = Cs(CS_ARCH_ARM, CS_MODE_THUMB if thumb else CS_MODE_ARM)
            parser.detail = True
            nearby = collections.Counter()
            integer_candidates = collections.Counter()
            float_candidates = collections.Counter()
            decoded = 0
            decoded_bytes = 0
            lexical_calls = []
            for ins in parser.disasm(code, address):
                decoded += 1
                decoded_bytes += ins.size
                if ins.mnemonic.startswith("bl") and ins.operands and \
                   ins.operands[0].type == ARM_OP_IMM:
                    target = int(ins.operands[0].imm) & ~1
                    callee = by_address.get(target)
                    if callee and any(k in callee.lower() for k in SCANNER_WORDS):
                        nearby[normalize(callee)] += 1
                        all_calls[normalize(display)].add(normalize(callee))
                        # Linear instruction order is not execution order:
                        # branch conditions/loops can reorder or skip calls.
                        if len(lexical_calls) < 100:
                            lexical_calls.append(normalize(callee))
                # Immediate values are *candidates*, never established
                # measurements. Restrict to small unsigned integers.
                if ins.mnemonic.split(".")[0] in ("mov", "movs", "movw", "cmp"):
                    for operand in ins.operands:
                        if operand.type == ARM_OP_IMM and 2 <= operand.imm <= 64:
                            integer_candidates[int(operand.imm)] += 1
                # A PC-relative literal load may refer to a float constant.
                # Only summarize plausible scalar values, no source addresses
                # or machine instructions are retained or exposed.
                if ins.mnemonic.startswith("vldr") and len(ins.operands) >= 2:
                    mem = ins.operands[1]
                    if mem.type != ARM_OP_MEM or mem.mem.base != ARM_REG_PC:
                        continue
                    pc = ((ins.address + (4 if thumb else 8)) // 4) * 4
                    raw = read_at(pc + mem.mem.disp, 4)
                    if raw and len(raw) == 4:
                        value = struct.unpack("<f", raw)[0]
                        if math.isfinite(value) and 0.05 <= abs(value) <= 100:
                            float_candidates[round(value, 4)] += 1
            flow = reachable_decode(code, address, thumb)
            flow_named = collections.Counter()
            for ins in flow["instructions"]:
                if not ins.group(CS_GRP_CALL) or not ins.operands or \
                   ins.operands[0].type != ARM_OP_IMM:
                    continue
                callee = by_address.get(int(ins.operands[0].imm) & ~1)
                if callee and any(k in callee.lower() for k in SCANNER_WORDS):
                    flow_named[normalize(callee)] += 1
                    reachable_calls[normalize(display)].add(normalize(callee))
            answers.append({
                "reachableDecodedBytes": sum(ins.size for ins in flow["instructions"]),
                "reachableInstructionCount": len(flow["instructions"]),
                "reachableNamedScannerCalls": dict(sorted(flow_named.items())),
                "reachableBranchEdges": flow["reachableBranchEdges"],
                "reachableUnresolvedTransfers": flow["unresolvedTransfers"],
                "reachableReturns": flow["returns"],
                "reachableRejectedDecodes": flow["rejectedDecodes"],
                "reachableBudgetExhausted": flow["budgetExhausted"],
                "function": normalize(display),
                "bytes": size, "thumb": bool(thumb),
                "decodedInstructionCount": decoded,
                "linearDecodedBytes": decoded_bytes,
                "functionBytesInspected": len(code),
                "namedScannerCalls": dict(sorted(nearby.items())),
                "lexicalCallsiteSequenceNotRuntimeOrder": lexical_calls,
                "immediateCandidatesNotDimensions": dict(sorted(
                    integer_candidates.items(), key=lambda row: (-row[1], row[0]))[:15]),
                "floatCandidatesNotDimensions": dict(sorted(
                    float_candidates.items(), key=lambda row: (-row[1], row[0]))[:15]),
            })
        # An outgoing-only graph misses who initiates calibration. Inspect
        # all size-bounded, named functions for immediate direct branches to
        # the selected methods; JNI entrypoints may not contain TileReader
        # or Java_ in their names. Indirect calls and virtual dispatch remain
        # outside this static inspection, and a non-call is not proof of absence.
        chosen = {entry[0]: normalize(entry[4]) for entry in focus}
        incoming = collections.defaultdict(set)
        for address, thumb, size, _raw, display in records:
            if address in chosen or size > 65536:
                continue
            body = read_at(address, size)
            if body is None:
                continue
            engine = Cs(CS_ARCH_ARM, CS_MODE_THUMB if thumb else CS_MODE_ARM)
            engine.detail = True
            for ins in engine.disasm(body, address):
                if ins.mnemonic.startswith("bl") and ins.operands and \
                   ins.operands[0].type == ARM_OP_IMM:
                    target = int(ins.operands[0].imm) & ~1
                    if target in chosen:
                        incoming[chosen[target]].add(normalize(display))
        names_of_interest = {entry["function"] for entry in answers}
        reachable_callers = {target: sorted(
            caller for caller, targets in reachable_calls.items()
            if target in targets)
            for target in sorted(names_of_interest)}
        callers = {target: sorted(
            {caller for caller, targets in all_calls.items()
             if target in targets} | incoming[target])
            for target in sorted(names_of_interest)}
        print(json.dumps({
            "method": "Static ELF symbol and direct-call inspection, not execution",
            "binarySha256": digest,
            "architecture": "ARM 32-bit",
            "selectedFunctionCount": len(answers),
            "availableImportedImageApisNotProvenCalled": image_api_imports,
            "functionFacts": answers,
            "selectedDirectCallers": callers,
            "selectedReachableDirectCallersAmongSelectedMethods": reachable_callers,
            "interpretation": ("Reachability follows direct branch targets from "
                               "exported function entrypoints; indirect branches, "
                               "jump tables, condition-dependent paths and exception "
                               "handling are unresolved. Coverage is neither complete "
                               "nor evidence of runtime branch choice. Linear disassembly "
                               "can stop at embedded data. Literal values are unclassified "
                               "and do not establish physical measurements or thresholds."),
            "redistributedOriginalBytes": False,
        }, indent=2))


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test_reachable_decode()
        raise SystemExit(0)
    if len(sys.argv) != 2:
        raise SystemExit("Usage: native-scanner-evidence.py original-libtile_reader.so")
    main(sys.argv[1])
