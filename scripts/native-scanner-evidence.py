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

from capstone import Cs, CS_ARCH_ARM, CS_MODE_ARM, CS_MODE_THUMB
from capstone.arm import ARM_OP_IMM, ARM_OP_MEM, ARM_REG_PC
from elftools.elf.elffile import ELFFile

FOCUS = (
    "TileReader::getBoardCorners", "TileReader::setBoardDimensions",
    "TileReader::computeBoard", "TileReader::drawGrid",
    "TileReader::removeBoardEdges", "TileReader::getWalls",
    "TileReader::processFromJNI", "TileReader::json",
    "stb::TileBoard::getBoardWalls", "stb::TileBoard::getTileAt",
    "stb::TileBoard::setTileAt", "stb::TileBoard::toJSON",
)
SCANNER_WORDS = ("tilereader::", "tileboard::", "getboard",
                 "removeboard", "findcontour", "hough", "opencv")


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
            for ins in parser.disasm(code, address):
                decoded += 1
                if ins.mnemonic.startswith("bl") and ins.operands and \
                   ins.operands[0].type == ARM_OP_IMM:
                    target = int(ins.operands[0].imm) & ~1
                    callee = by_address.get(target)
                    if callee and any(k in callee.lower() for k in SCANNER_WORDS):
                        nearby[normalize(callee)] += 1
                        all_calls[normalize(display)].add(normalize(callee))
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
            answers.append({
                "function": normalize(display),
                "bytes": size, "thumb": bool(thumb),
                "decodedInstructionCount": decoded,
                "namedScannerCalls": dict(sorted(nearby.items())),
                "immediateCandidatesNotDimensions": dict(sorted(
                    integer_candidates.items(), key=lambda row: (-row[1], row[0]))[:15]),
                "floatCandidatesNotDimensions": dict(sorted(
                    float_candidates.items(), key=lambda row: (-row[1], row[0]))[:15]),
            })
        # The caller list exposes relationships in both directions, but
        # does not imply that all indirect or library calls were identified.
        names_of_interest = {entry["function"] for entry in answers}
        callers = {target: sorted(caller for caller, targets in all_calls.items()
                                  if target in targets)
                   for target in sorted(names_of_interest)}
        print(json.dumps({
            "method": "Static ELF symbol and direct-call inspection, not execution",
            "binarySha256": digest,
            "architecture": "ARM 32-bit",
            "selectedFunctionCount": len(answers),
            "functionFacts": answers,
            "selectedDirectCallers": callers,
            "interpretation": ("Literal values are unclassified. Their presence "
                               "does not establish physical grid pitch, wall "
                               "lengths, thresholds or camera calibration."),
            "redistributedOriginalBytes": False,
        }, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: native-scanner-evidence.py original-libtile_reader.so")
    main(sys.argv[1])
