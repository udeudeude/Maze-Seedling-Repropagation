#!/usr/bin/env python3
"""Static inspection of a preserved Seedling XAPK; no application code is executed."""
import collections, hashlib, io, json, os, re, shutil, sys, tempfile, zipfile
from pathlib import Path

TERMS = re.compile(r"maze|seedling|board|scan|camera|grid|calib|wall|block|floor|hole|trap|start|finish|portal|teleport|castle|ruin|spaceship|space|temple|environment|world|map|cardboard|stereo|player|multiplayer|network|photon|room|race|puzzle|editor|audio|sound|riddle|avatar|capture|photo|recogn|gyro|accelerometer", re.I)
LIMIT = 750 * 1024 * 1024

def save(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str) + "\n")

def clean(value):
    return str(value).replace("\n", " ").replace("\r", " ")[:220]

def member(z, extension):
    found = [x for x in z.infolist() if x.filename.lower().endswith(extension) and x.file_size < LIMIT]
    return sorted(found, key=lambda x: x.filename)[0] if found else None

def extract(z, item, path):
    with z.open(item) as source, open(path, "wb") as output:
        shutil.copyfileobj(source, output, 1024 * 1024)

def package_info(original, apk, result):
    with zipfile.ZipFile(original) as archive:
        source = member(archive, "manifest.json")
        if source:
            try:
                result["xapk_manifest"] = json.loads(archive.read(source).decode("utf-8"))
            except Exception as exc:
                result["manifest_error"] = clean(exc)
    try:
        from androguard.core.apk import APK
        parsed = APK(str(apk))
        result["android"] = {
            "package": parsed.get_package(),
            "version_name": parsed.get_androidversion_name(),
            "version_code": parsed.get_androidversion_code(),
            "permissions": sorted(parsed.get_permissions()),
            "activities": sorted(parsed.get_activities()),
            "services": sorted(parsed.get_services())
        }
    except Exception as exc:
        result["android_parse_error"] = clean(exc)

def managed_types(apk):
    output = {"assemblies": [], "interesting_types": []}
    try:
        import dnfile
        with zipfile.ZipFile(apk) as source:
            for entry in source.infolist():
                if not entry.filename.startswith("assets/bin/Data/Managed/") or not entry.filename.endswith(".dll"):
                    continue
                row = {"file": entry.filename, "bytes": entry.file_size, "types": []}
                try:
                    with tempfile.NamedTemporaryFile(suffix=".dll") as temp:
                        temp.write(source.read(entry)); temp.flush()
                        pe = dnfile.dnPE(temp.name)
                        if pe.net and pe.net.mdtables and pe.net.mdtables.TypeDef:
                            for typedef in pe.net.mdtables.TypeDef:
                                name = clean(typedef.TypeName)
                                namespace = clean(typedef.TypeNamespace)
                                methods = []
                                try:
                                    for index in typedef.MethodList:
                                        method = getattr(index, "row", index)
                                        methods.append(clean(method.Name))
                                except Exception:
                                    pass
                                item = {"name": (namespace + "." if namespace else "") + name, "methods": methods}
                                row["types"].append(item)
                                if TERMS.search(item["name"]) or (entry.filename.endswith("/Assembly-CSharp.dll") and TERMS.search(" ".join(methods))):
                                    output["interesting_types"].append({"assembly": Path(entry.filename).name, **item})
                except Exception as exc:
                    row["error"] = clean(exc)
                output["assemblies"].append(row)
    except Exception as exc:
        output["error"] = clean(exc)
    output["summary"] = {
        "assembly_count": len(output["assemblies"]),
        "type_count": sum(len(x["types"]) for x in output["assemblies"]),
        "interesting_type_count": len(output["interesting_types"])
    }
    return output

def image_info(apk):
    result = []
    try:
        from PIL import Image
    except ImportError:
        Image = None
    with zipfile.ZipFile(apk) as source:
        for entry in source.infolist():
            if not entry.filename.lower().endswith((".png", ".jpg", ".jpeg")):
                continue
            item = {"file": entry.filename, "bytes": entry.file_size}
            if Image is not None and entry.file_size < 8000000:
                try:
                    with Image.open(io.BytesIO(source.read(entry))) as pic:
                        item["dimensions"] = list(pic.size)
                except Exception:
                    pass
            result.append(item)
    return {"count": len(result),
            "interesting": [x for x in result if TERMS.search(x["file"])][:250],
            "largest": sorted(result, key=lambda x: x["bytes"], reverse=True)[:120],
            "dimensions": collections.Counter(str(x.get("dimensions", "unknown")) for x in result).most_common(25)}

def unity_info(apk, obb):
    output = {"files": [], "errors": [], "interesting_names": []}
    try:
        import UnityPy
    except Exception as exc:
        output["error"] = clean(exc)
        return output
    totals = collections.Counter()
    with tempfile.TemporaryDirectory() as folder:
        for origin, path in (("apk", apk), ("obb", obb)):
            if path is None:
                continue
            with zipfile.ZipFile(path) as archive:
                groups = collections.defaultdict(list)
                for entry in archive.infolist():
                    name = entry.filename.lower()
                    if origin == "apk" and "assets/bin/data/" not in name:
                        continue
                    if "/managed/" in name or "/resources/" in name or name.endswith((".xml", ".png", ".jpg", ".json", ".so")):
                        continue
                    base = re.sub(r"\.split\d+$", "", entry.filename)
                    if not any(term in base.lower() for term in (".assets", "level", "globalgamemanagers", ".bundle")):
                        continue
                    groups[base].append(entry)
                for group, parts in sorted(groups.items()):
                    if sum(x.file_size for x in parts) > 550000000:
                        output["errors"].append({"file": group, "error": "too large"})
                        continue
                    def key(part):
                        found = re.search(r"\.split(\d+)$", part.filename)
                        return int(found.group(1)) if found else -1
                    parts.sort(key=key)
                    combined = Path(folder) / "combined.bin"
                    with combined.open("wb") as output_file:
                        for part in parts:
                            with archive.open(part) as inp:
                                shutil.copyfileobj(inp, output_file, 1024 * 1024)
                    try:
                        env = UnityPy.load(str(combined))
                        counts = collections.Counter()
                        names = []
                        for obj in env.objects:
                            kind = str(getattr(getattr(obj, "type", None), "name", "Unknown"))
                            counts[kind] += 1
                            totals[kind] += 1
                            if kind in {"GameObject", "MonoBehaviour", "Texture2D", "Sprite", "AudioClip", "Mesh", "Material", "TextAsset", "AssetBundle", "SceneAsset", "AnimationClip", "Shader", "Font"}:
                                try:
                                    label = clean(obj.peek_name())
                                    if label and label != "None":
                                        names.append({"type": kind, "name": label})
                                        if TERMS.search(label):
                                            output["interesting_names"].append({"file": group, "type": kind, "name": label})
                                except Exception:
                                    pass
                        output["files"].append({"origin": origin, "file": group, "bytes": combined.stat().st_size, "fragments": len(parts), "counts": dict(counts), "names": names[:350]})
                    except Exception as exc:
                        output["errors"].append({"file": origin + ":" + group, "error": clean(exc)})
                    finally:
                        combined.unlink(missing_ok=True)
    output["total_types"] = dict(totals)
    output["files_parsed"] = len(output["files"])
    output["interesting_names"] = output["interesting_names"][:500]
    return output

def main():
    source, destination = sys.argv[1:3]
    Path(destination).mkdir(parents=True, exist_ok=True)
    with open(source, "rb") as contents:
        fingerprint = hashlib.file_digest(contents, "sha256").hexdigest()
    with zipfile.ZipFile(source) as xapk:
        apk_item = member(xapk, ".apk")
        obb_item = member(xapk, ".obb")
        if apk_item is None:
            raise RuntimeError("The XAPK did not contain an APK")
        with tempfile.TemporaryDirectory() as folder:
            apk = Path(folder) / "application.apk"
            obb = Path(folder) / "expansion.obb" if obb_item else None
            extract(xapk, apk_item, apk)
            if obb_item:
                extract(xapk, obb_item, obb)
            package = {"download_sha256": fingerprint,
                       "download_bytes": os.stat(source).st_size,
                       "apk_bytes": apk_item.file_size,
                       "obb_bytes": obb_item.file_size if obb_item else 0}
            package_info(source, apk, package)
            save(Path(destination) / "package.json", package)
            code = managed_types(apk)
            save(Path(destination) / "managed-types.json", code)
            images = image_info(apk)
            save(Path(destination) / "images.json", images)
            unity = unity_info(apk, obb)
            save(Path(destination) / "unity-assets.json", unity)
            print("PACKAGE", json.dumps(package, ensure_ascii=False)[:1200])
            print("CODE", json.dumps(code.get("summary")))
            for x in code.get("interesting_types", [])[:120]:
                print("CODE HIGHLIGHT", x["assembly"], x["name"], ", ".join(x["methods"][:16]))
            print("IMAGES", json.dumps({"count": images["count"], "interesting": len(images["interesting"])}))
            print("UNITY", json.dumps({"files_parsed": unity.get("files_parsed"), "total_types": unity.get("total_types"), "errors": unity.get("errors", [])[:12]})[:2500])
            for x in unity.get("interesting_names", [])[:120]:
                print("UNITY HIGHLIGHT", json.dumps(x, ensure_ascii=False))

if __name__ == "__main__":
    main()
