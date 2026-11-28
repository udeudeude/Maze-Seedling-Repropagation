#!/usr/bin/env python3
"""Inspect original Seedling DEX scanner setup without republishing its bytecode.

Outputs only method identities, direct invocation relationships and explicitly
qualified constant *candidates*. A nearby integer does not establish argument
flow, physical dimensions or a scanner threshold. No original instructions,
assets or binary are written to the repository or output.
"""
import collections
import hashlib
import json
import re
import sys
from pathlib import Path

OWNER_PREFIXES = (
    "Lcom/seedling/maze/",
    "Lcom/example/zac/editmaze/",
    "Lcom/seedling/androidunityplugin/",
)
SCANNER_TERMS = ("tilereader", "capture", "scan", "board", "corner",
                 "grid", "processfromjni", "calibrat", "preview")
IMPORTANT_CALLEES = ("setboarddimensions", "processfromjni", "getboardcorners",
                     "computeboard", "setboardsize", "setgridsize",
                     "processoverlay", "processpreview", "processscan",
                     "oncameraframe", "rotate90", "setupoverlayprocessingthread",
                     "stringfromjni")
CALL_PATTERN = re.compile(r"(L[^\s,]+;)->([^\s(]+)(\([^\s)]*\)[^\s,]*)")
CONSTANT_PATTERN = re.compile(r"^v(\d+),\s*(?:#)?(-?(?:0x[0-9a-fA-F]+|\d+))$")


def selected_callee(text):
    """Only actual Dalvik invoke targets, never arbitrary scanner-related text."""
    matched = CALL_PATTERN.search(text)
    if not matched:
        return None
    owner, method, descriptor = matched.groups()
    if not (owner.startswith(OWNER_PREFIXES) and
            (any(term in (owner + method).lower() for term in SCANNER_TERMS) or
             method.lower() in IMPORTANT_CALLEES)):
        return None
    return owner, method, descriptor


def nearby_literal_candidates(instructions, index):
    """Summarize non-proven constant candidates, not their register provenance."""
    values = collections.Counter()
    for name, output in instructions[max(0, index - 14):index]:
        if not name.startswith("const"):
            continue
        matched = CONSTANT_PATTERN.match(output.strip())
        if matched:
            try:
                value = int(matched.group(2), 0)
            except ValueError:
                continue
            if 0 <= value <= 60:
                values[value] += 1
    return dict(sorted(values.items()))


def inspect_instructions(instructions, caller):
    """Return high-level callsite summaries from an already decoded method."""
    results = []
    for i, (name, output) in enumerate(instructions):
        if not name.startswith("invoke-"):
            continue
        callee = selected_callee(output)
        if not callee:
            continue
        owner, method, signature = callee
        results.append({
            "caller": caller,
            "calleeClass": owner,
            "calleeMethod": method,
            "calleeDescriptor": signature,
            "nearbyIntegerLiteralsNotArguments":
                nearby_literal_candidates(instructions, i),
        })
    return results


def self_test():
    matched = selected_callee(
        "v0, v2, v3, Lcom/seedling/maze/TileReader;->setBoardDimensions(II)V")
    assert matched == (
        "Lcom/seedling/maze/TileReader;", "setBoardDimensions", "(II)V")
    assert selected_callee("v0, Landroid/os/Bundle;->getString()Ljava/lang/String;") is None
    assert selected_callee("not an invocation") is None
    sample = [
        ("const/16", "v2, 0x12"),
        ("const/4", "v3, 0x7"),
        ("invoke-virtual", "v0, v2, v3, Lcom/seedling/maze/TileReader;->setBoardDimensions(II)V"),
        ("invoke-virtual", "v0, Landroid/os/Bundle;->getString()Ljava/lang/String;"),
    ]
    calls = inspect_instructions(sample, "sample")
    assert len(calls) == 1 and calls[0]["calleeMethod"] == "setBoardDimensions"
    assert calls[0]["nearbyIntegerLiteralsNotArguments"] == {7: 1, 18: 1}
    # The same preceding constants could belong to unrelated statements.
    # Refuse to present their association as verified parameter tracing.
    assert "arguments" not in calls[0]
    assert nearby_literal_candidates([("const/4", "v0, -1")], 1) == {}
    synthetic = [
        ("Lcom/seedling/maze/activity/MazeCaptureActivity;->processScan(Landroid/view/View;)V", [
            ("invoke-virtual", "v0, Lcom/seedling/maze/TileReader;->stringFromJNI()Ljava/lang/String;"),
            ("invoke-static", "v0, Lcom/seedling/maze/MazeCaptureJsonFixer;->fixCapturedMazeJson(Ljava/lang/String;)Ljava/lang/String;")]),
        ("Lcom/seedling/maze/MazeCaptureJsonFixer;->fixCapturedMazeJson(Ljava/lang/String;)Ljava/lang/String;", [
            ("const-string", 'v1, "cells"'),
            ("const-string", 'v2, "copyrighted-original-text-not-a-schema-key"'),
            ("invoke-virtual", "v0, v1, Lorg/json/JSONObject;->getJSONArray(Ljava/lang/String;)Lorg/json/JSONArray;"),
            ("invoke-virtual", "v0, Ljava/lang/String;->toString()Ljava/lang/String;")]),
    ]
    evidence = capture_json_handoff(synthetic)
    assert len(evidence["originalFixerMethods"]) == 1
    assert len(evidence["directFixerCallsites"]) == 1
    assert len(evidence["processScanCallsitesInInstructionOrderNotRuntimeOrder"]) == 2
    assert evidence["knownPresetSchemaKeyLiteralOccurrencesWithinFixer"] == {"cells": 1}
    assert evidence["jsonApiCallsWithinFixer"] == {
        "Lorg/json/JSONObject;->getJSONArray": 1}
    assert evidence["standardPlatformCallsWithinFixer"] == {
        "Ljava/lang/String;->toString": 1}
    assert "copyrighted-original-text" not in str(evidence)
    source = ("invoke-virtual", "v0, Lcom/seedling/maze/TileReader;->stringFromJNI()Ljava/lang/String;")
    sink = ("invoke-static", "v2, Lcom/seedling/maze/MazeCaptureJsonFixer;->fixCapturedMazeJson(Ljava/lang/String;)Ljava/lang/String;")
    assert directly_forwarded_scanner_string([source,
        ("move-result-object", "v1"),
        ("move-object", "v2, v1"), sink])
    for invalid in [
        [source, ("move-result-object", "v1"), sink],
        [source, ("move-result-object", "v1"), ("const-string", 'v1, "other"'),
            ("move-object", "v2, v1"), sink],
        [source, ("move-result-object", "v1"), ("if-eqz", "v1, +4"), sink],
        [source, ("move-result-object", "v1"), ("invoke-virtual",
            "v0, Ljava/lang/Object;->toString()Ljava/lang/String;"), sink],
    ]:
        assert not directly_forwarded_scanner_string(invalid)
    assert capture_json_handoff([("Lother/class;->unrelated()V", [
        ("const-string", 'v1, "cells"')])])["originalFixerMethods"] == []
    print("Synthetic DEX scanner-call selection and negative controls passed")



# Only schema keys already independently recovered from the original preset
# documents. Never print arbitrary literal strings (potential artwork, copy,
# URLs, IDs or personal data) from the copyrighted application.
KNOWN_SCHEMA_KEYS = frozenset((
    "source", "uniqueIdentifier", "version", "options", "data", "name",
    "cells", "duration", "player_avatars", "scale", "theme", "position",
    "type", "variant", "entrance", "exit", "wall", "true", "false",
))
FIXER_CLASS = "Lcom/seedling/maze/MazeCaptureJsonFixer;"
CAPTURE_CLASS = "Lcom/seedling/maze/activity/MazeCaptureActivity;"
NATIVE_CLASS = "Lcom/seedling/maze/TileReader;"



def directly_forwarded_scanner_string(instructions):
    """Prove only an adjacent, unmodified Dalvik result forwarded to the fixer.

    Any intervening branch, arbitrary instruction, another invoke or register
    update makes this bounded check inconclusive. It never claims that a
    lexical sequence necessarily executes on any particular scan.
    """
    for i, (name, output) in enumerate(instructions):
        if not name.startswith("invoke-"):
            continue
        call = CALL_PATTERN.search(output)
        if not call or call.group(1) != NATIVE_CLASS or \
                call.group(2) != "stringFromJNI":
            continue
        if i + 2 >= len(instructions):
            continue
        result_name, result_out = instructions[i + 1]
        if result_name != "move-result-object":
            continue
        aliases = {result_out.strip()}
        if not re.fullmatch(r"[vp]\d+", result_out.strip()):
            continue
        for next_name, next_out in instructions[i + 2:i + 6]:
            if next_name.startswith("invoke-"):
                sink = CALL_PATTERN.search(next_out)
                if sink and sink.group(1) == FIXER_CLASS and \
                        sink.group(2) == "fixCapturedMazeJson" and \
                        next_name == "invoke-static":
                    arguments = next_out.split("L", 1)[0]
                    registers = set(re.findall(r"\b[vp]\d+\b", arguments))
                    return bool(registers & aliases)
                break
            if next_name == "move-object":
                operands = re.findall(r"\b[vp]\d+\b", next_out)
                if len(operands) != 2:
                    break
                dst, src = operands
                if src in aliases:
                    aliases.add(dst)
                else:
                    aliases.discard(dst)
                continue
            # Even a simple condition may jump into another assignment.
            break
    return False


def capture_json_handoff(decoded_methods):
    """Bounded original scanner->JSON handoff survey, not execution or decompilation.

    The result contains *only* method identities, known public schema-key
    occurrences and call counts. Calls in lexical DEX order do not establish
    that a result is passed from one function to another. A field-key literal
    does not establish a JSON mutation or its value.
    """
    fixer_methods = []
    fixer_calls = []
    capture_calls = []
    native_return_directly_to_fixer = False
    json_calls = collections.Counter()
    fixer_schema_keys = collections.Counter()
    platform_invocations = collections.Counter()
    arithmetic_opcodes = collections.Counter()
    for caller, instructions in decoded_methods:
        is_fixer = caller.startswith(FIXER_CLASS + "->")
        is_capture_scan = caller.startswith(CAPTURE_CLASS + "->processScan(")
        if is_fixer:
            fixer_methods.append(caller)
        if is_capture_scan:
            native_return_directly_to_fixer = directly_forwarded_scanner_string(instructions)
        if not (is_fixer or is_capture_scan):
            # Still scan a bounded set of direct incoming fixer calls.
            for name, output in instructions:
                if name.startswith("invoke-"):
                    matched = CALL_PATTERN.search(output)
                    if matched and matched.group(1) == FIXER_CLASS:
                        fixer_calls.append({"caller": caller,
                            "callee": matched.group(2) + matched.group(3)})
            continue
        for name, output in instructions:
            if is_fixer and (name.startswith(("add-", "sub-", "mul-", "div-",
                "rem-", "neg-", "shl-", "shr-", "ushr-", "and-", "or-", "xor-"))):
                arithmetic_opcodes[name.split("-")[0]] += 1
            if is_fixer and name.startswith("const-string"):
                # Use quoted exact-match schema identifiers only, never a
                # pattern that emits an arbitrary original string.
                found = re.search(r'"([^"]*)"', output)
                if found and found.group(1) in KNOWN_SCHEMA_KEYS:
                    fixer_schema_keys[found.group(1)] += 1
            if not name.startswith("invoke-"):
                continue
            matched = CALL_PATTERN.search(output)
            if not matched:
                continue
            owner, method, descriptor = matched.groups()
            if owner == FIXER_CLASS:
                fixer_calls.append({"caller": caller, "callee": method + descriptor})
            if is_capture_scan and owner in (
                    FIXER_CLASS, NATIVE_CLASS, CAPTURE_CLASS):
                capture_calls.append({"caller": caller,
                    "callee": owner + "->" + method + descriptor})
            if is_fixer and owner in (
                    "Lorg/json/JSONObject;", "Lorg/json/JSONArray;"):
                json_calls[owner + "->" + method] += 1
            if is_fixer and owner in (
                    "Ljava/lang/String;", "Ljava/lang/StringBuilder;",
                    "Ljava/util/regex/Pattern;", "Ljava/util/regex/Matcher;",
                    "Ljava/util/ArrayList;", "Ljava/util/List;",
                    "Ljava/lang/Integer;", "Ljava/lang/Math;",
                    "Ljava/util/Collections;"):
                platform_invocations[owner + "->" + method] += 1
    return {
        "originalFixerMethods": sorted(fixer_methods),
        "nativeStringDirectlyForwardedToFixerWithoutInterveningOperation":
            native_return_directly_to_fixer,
        "directFixerCallsites": sorted(fixer_calls,
            key=lambda site: (site["caller"], site["callee"]))[:30],
        "processScanCallsitesInInstructionOrderNotRuntimeOrder": capture_calls[:30],
        "jsonApiCallsWithinFixer": dict(sorted(json_calls.items())),
        "standardPlatformCallsWithinFixer": dict(sorted(platform_invocations.items())),
        "numericOperatorCountsWithinFixerNotEquations": dict(sorted(arithmetic_opcodes.items())),
        "knownPresetSchemaKeyLiteralOccurrencesWithinFixer":
            dict(sorted(fixer_schema_keys.items())),
        "interpretation": ("Direct Java invocations and short public schema-key "
            "literals only. No original bytecode, disassembly, free-form text, "
            "JSON payload or derived original maze is output. A method call "
            "sequence is not proof of execution order or value propagation; "
            "literal key presence does not identify a write."),
    }


def main(path):
    from androguard.core.dex import DEX
    source = Path(path)
    if source.stat().st_size > 35_000_000:
        raise ValueError("Oversized original DEX; refusing unbounded inspection")
    raw = source.read_bytes()
    dex = DEX(raw)
    class_names = sorted(cls.get_name() for cls in dex.get_classes()
                         if cls.get_name().startswith(OWNER_PREFIXES))
    callsites = []
    decoded_methods = []
    named_methods = []
    matched_method_count = 0
    for cls in dex.get_classes():
        for method in cls.get_methods():
            method_name = method.get_name()
            caller = cls.get_name() + "->" + method_name + method.get_descriptor()
            if cls.get_name().startswith(OWNER_PREFIXES) and any(
                term in (cls.get_name() + method_name).lower()
                for term in SCANNER_TERMS
            ):
                named_methods.append(caller)
            code = method.get_code()
            if code is None:
                continue
            if not cls.get_name().startswith(OWNER_PREFIXES):
                continue
            decoded = [(instruction.get_name(), instruction.get_output())
                       for instruction in method.get_instructions()]
            decoded_methods.append((caller, decoded))
            observed = inspect_instructions(decoded, caller)
            if observed:
                matched_method_count += 1
                callsites.extend(observed)
    grouped = collections.defaultdict(list)
    for site in callsites:
        key = site["calleeClass"] + "->" + site["calleeMethod"] + site["calleeDescriptor"]
        grouped[key].append(site)
    focus = {key: [{
        "caller": x["caller"],
        "nearbyIntegerLiteralsNotArguments": x["nearbyIntegerLiteralsNotArguments"],
    } for x in members[:20]] for key, members in sorted(grouped.items())
        if any(term in key.lower() for term in IMPORTANT_CALLEES)}
    # Callsite counts and method names are facts from the original DEX. Literal
    # occurrence within 14 instructions is NOT dataflow or proof of arguments.
    print(json.dumps({
        "method": "Read-only Dalvik direct-invoke inspection; no app execution",
        "dexSha256": hashlib.sha256(raw).hexdigest(),
        "packageClassesInspected": len(class_names),
        "scannerNamedMethods": sorted(named_methods)[:100],
        "methodsWithRelevantDirectInvokes": matched_method_count,
        "relevantCallCount": len(callsites),
        "invocationCounts": dict(sorted(
            (key, len(value)) for key, value in grouped.items())),
        "priorityCallsites": focus,
        "limitations": ("Direct DEX invokes do not reveal native C++ callers, "
                        "indirect dispatch, runtime branches or camera image "
                        "thresholds. Nearby literal candidates are not traced "
                        "arguments and must not be adopted as board calibration."),
        "captureJsonFixerEvidence": capture_json_handoff(decoded_methods),
        "redistributedOriginalBytes": False,
    }, indent=2))


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    elif len(sys.argv) == 2:
        main(sys.argv[1])
    else:
        raise SystemExit("Usage: scanner-dex-geometry.py --self-test | classes.dex")
