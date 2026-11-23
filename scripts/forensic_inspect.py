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
                                try:
                                    item["fields"] = [clean(getattr(field, "row", field).Name) for field in typedef.FieldList]
                                except Exception:
                                    item["fields"] = []
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


def dex_info(apk):
    result = {"classes": [], "native_libraries": [], "layouts": [], "errors": []}
    try:
        from androguard.core.dex import DEX
        from androguard.core.axml import AXMLPrinter
        with zipfile.ZipFile(apk) as source:
            result["native_libraries"] = sorted(n for n in source.namelist() if n.startswith("lib/") and n.endswith(".so"))
            for path in source.namelist():
                if not path.startswith("res/layout/") or not path.endswith(".xml"):
                    continue
                if not TERMS.search(path):
                    continue
                layout = {"file": path, "elements": []}
                try:
                    root = AXMLPrinter(source.read(path)).get_xml_obj()
                    for node in root.iter():
                        tag = str(node.tag).split("}")[-1]
                        label = []
                        for attr, value in node.attrib.items():
                            key = str(attr).split("}")[-1]
                            if key in {"id", "text", "hint", "contentDescription"}:
                                label.append({key: str(value)[:100]})
                        layout["elements"].append({"tag": tag, "attributes": label})
                except Exception as exc:
                    layout["error"] = clean(exc)
                result["layouts"].append(layout)
            binary = source.read("classes.dex")
        dex = DEX(binary)
        for cls in dex.get_classes():
            name = cls.get_name()
            if not any(name.startswith(prefix) for prefix in (
                "Lcom/seedling/maze/", "Lcom/example/zac/editmaze/",
                "Lcom/seedling/androidunityplugin/")):
                continue
            methods = []
            fields = []
            try:
                methods = [clean(method.get_name()) + clean(method.get_descriptor()) for method in cls.get_methods()]
                fields = [clean(field.get_name()) for field in cls.get_fields()]
            except Exception as exc:
                result["errors"].append({"class": name, "error": clean(exc)})
            result["classes"].append({"name": name, "methods": methods, "fields": fields})
    except Exception as exc:
        result["errors"].append({"stage": "dex", "error": clean(exc)})
    result["class_count"] = len(result["classes"])
    return result

def preset_info(apk):
    result = {"files": [], "errors": []}
    with zipfile.ZipFile(apk) as source:
        for name in sorted(source.namelist()):
            if not (name.startswith("assets/json/") and name.endswith(".json")):
                continue
            try:
                data = json.loads(source.read(name).decode("utf-8-sig"))
            except Exception as exc:
                result["errors"].append({"file": name, "error": clean(exc)})
                continue
            paths = collections.defaultdict(lambda: {"kinds": [], "lengths": [], "examples": []})
            def inspect(value, path, level=0):
                if level > 7 or len(paths) > 650:
                    return
                row = paths[path]
                kind = type(value).__name__
                if kind not in row["kinds"]:
                    row["kinds"].append(kind)
                if isinstance(value, dict):
                    if len(row["examples"]) < 2:
                        row["examples"].append({"keys": list(value)[:65]})
                    for key, child in value.items():
                        inspect(child, path + "." + str(key), level + 1)
                elif isinstance(value, list):
                    if len(row["lengths"]) < 6 and len(value) not in row["lengths"]:
                        row["lengths"].append(len(value))
                    for child in value[:35]:
                        inspect(child, path + "[]", level + 1)
                elif isinstance(value, (int, float, bool)) and not isinstance(value, bool):
                    if len(row["examples"]) < 5 and value not in row["examples"]:
                        row["examples"].append(value)
                elif isinstance(value, str):
                    if len(row["examples"]) < 3 and len(value) < 70 and TERMS.search(path):
                        row["examples"].append(clean(value))
            inspect(data, "$")
            cells = data.get("data", {}).get("cells", []) if isinstance(data, dict) else []
            counts = collections.Counter(clean(cell.get("type")) for cell in cells if isinstance(cell, dict))
            variants = collections.Counter(clean(cell.get("variant", "(none)")) for cell in cells if isinstance(cell, dict))
            coords = [[], [], []]
            for cell in cells:
                if not isinstance(cell, dict):
                    continue
                pos = cell.get("position")
                if isinstance(pos, list) and len(pos) == 3:
                    for axis, value in enumerate(pos):
                        try:
                            coords[axis].append(int(value))
                        except (TypeError, ValueError):
                            pass
            mechanics = {
                "theme": data.get("data", {}).get("theme"),
                "scale": data.get("data", {}).get("scale"),
                "duration": data.get("data", {}).get("duration"),
                "options": data.get("options", {}),
                "types": dict(counts),
                "variants": dict(variants),
                "axis_bounds": [{"min": min(vals), "max": max(vals), "distinct": len(set(vals))} if vals else None for vals in coords],
                "unique_cell_keys": sorted({key for cell in cells if isinstance(cell, dict) for key in cell})
            }
            result["files"].append({"file": name, "schema": dict(paths), "mechanics": mechanics})
    result["file_count"] = len(result["files"])
    return result



def native_symbols(apk):
    import subprocess
    result = {"symbols": [], "relevant_strings": [], "errors": []}
    try:
        with zipfile.ZipFile(apk) as source:
            binary = "lib/armeabi-v7a/libtile_reader.so"
            if binary not in source.namelist():
                return {"error": "Missing expected libtile_reader.so"}
            with tempfile.NamedTemporaryFile(suffix=".so") as temp:
                temp.write(source.read(binary))
                temp.flush()
                for command, label in [
                    (["nm", "-D", "-C", "--defined-only", temp.name], "symbols"),
                    (["strings", "-a", "-n", "7", temp.name], "relevant_strings")
                ]:
                    try:
                        proc = subprocess.run(command, capture_output=True, text=True, timeout=20)
                        if proc.returncode:
                            result["errors"].append({"stage": label, "returncode": proc.returncode, "error": clean(proc.stderr)})
                        lines = proc.stdout.splitlines()
                        if label == "symbols":
                            result[label] = [clean(line) for line in lines if TERMS.search(line) or "JNI" in line or "Java_" in line][:400]
                        else:
                            result[label] = [clean(line) for line in lines if TERMS.search(line) or "OpenCV" in line][:150]
                    except Exception as exc:
                        result["errors"].append({"stage": label, "error": clean(exc)})
    except Exception as exc:
        result["errors"].append({"stage": "extract", "error": clean(exc)})
    return result


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
            java = dex_info(apk)
            save(Path(destination) / "android-code.json", java)
            presets = preset_info(apk)
            save(Path(destination) / "presets-schema.json", presets)
            native = native_symbols(apk)
            save(Path(destination) / "native-scanner.json", native)
            unity = unity_info(apk, obb)
            save(Path(destination) / "unity-assets.json", unity)
            print("PACKAGE", json.dumps(package, ensure_ascii=False)[:1200])
            print("CODE", json.dumps(code.get("summary")))
            for x in code.get("interesting_types", [])[:120]:
                print("CODE HIGHLIGHT", x["assembly"], x["name"], ", ".join(x["methods"][:16]))
            print("IMAGES", json.dumps({"count": images["count"], "interesting": len(images["interesting"])}))
            print("ANDROID CODE", json.dumps({"class_count": java["class_count"], "native_libraries": java["native_libraries"], "errors": java["errors"][:10]}))
            for x in java["classes"]:
                print("ANDROID CLASS", x["name"], "FIELDS", ", ".join(x["fields"][:15]), "METHODS", ", ".join(x["methods"][:25]))
            print("PRESET FILES", presets["file_count"], "ERRORS", presets["errors"])
            for x in presets["files"]:
                print("PRESET", x["file"], "MECHANICS", json.dumps(x["mechanics"]))
            print("NATIVE SYMBOLS", json.dumps(native.get("symbols", [])[:100]))
            print("NATIVE ERRORS", json.dumps(native.get("errors", [])))
            print("UNITY", json.dumps({"files_parsed": unity.get("files_parsed"), "total_types": unity.get("total_types"), "errors": unity.get("errors", [])[:12]})[:2500])
            for x in unity.get("interesting_names", [])[:120]:
                print("UNITY HIGHLIGHT", json.dumps(x, ensure_ascii=False))

if __name__ == "__main__":
    main()
