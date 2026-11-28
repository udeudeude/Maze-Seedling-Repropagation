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
                     "computeboard", "setboardsize", "setgridsize")
CALL_PATTERN = re.compile(r"(L[^\s,]+;)->([^\s(]+)(\([^\s]*\))")
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
    print("Synthetic DEX scanner-call selection and negative controls passed")


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
        "redistributedOriginalBytes": False,
    }, indent=2))


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    elif len(sys.argv) == 2:
        main(sys.argv[1])
    else:
        raise SystemExit("Usage: scanner-dex-geometry.py --self-test | classes.dex")
