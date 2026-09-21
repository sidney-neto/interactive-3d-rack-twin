"""Dependency-free GLB contract validation; uses the existing glTF matrix helpers."""
import itertools
import json
from pathlib import Path
import re
import struct
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "xe7745"))
from validate_glb import matrix, multiply
from config import S5232F_SPEC as SPEC


def validate_glb(path):
    data = Path(path).read_bytes()
    assert struct.unpack_from("<4sII", data) == (b"glTF", 2, len(data)), "Invalid GLB header"
    length, kind = struct.unpack_from("<II", data, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(data[20:20 + length])
    nodes, meshes, accessors = doc["nodes"], doc["meshes"], doc["accessors"]
    names = [n["name"] for n in nodes]
    assert len(names) == len(set(names)), "Duplicate exported names"
    assert len(doc["scenes"]) == 1
    assert not doc.get("cameras") and not doc.get("animations")
    assert "KHR_lights_punctual" not in doc.get("extensions", {})
    by_name = dict(zip(names, nodes))
    required = ["S5232F_ROOT", "chassis_shell", "top_panel", "io_side", "io_panel", "psu_side", "psu_panel",
                "rack_ear_left", "rack_ear_right", "stack_id", "status_led_area", "reset_button", "luggage_tag"]
    assert set(required) <= set(names), set(required) - set(names)
    counts = {}
    contracts = {}
    for prefix, key, slot, asset_type in [
        ("qsfp28", "qsfp28_port_count", "PORT", "network-port"),
        ("sfpplus", "sfpplus_port_count", "SFPPLUS", "network-port"),
        ("psu", "psu_count", "PSU", "power-supply"),
        ("fan_module", "fan_module_count", "FAN", "fan-module"),
    ]:
        actual = [n for n in names if re.fullmatch(prefix + r"_\d{2}", n)]
        assert len(actual) == SPEC[key], (prefix, len(actual))
        counts[prefix] = len(actual)
        for i in range(1, SPEC[key] + 1):
            contracts[f"{prefix}_{i:02d}"] = dict(slot=f"{slot}-{i:02d}", assetType=asset_type, selectable=True, focusable=True)
            if prefix == "qsfp28": contracts[f"{prefix}_{i:02d}"].update(physicalPort=i, portType="QSFP28", nominalSpeed="100G")
            if prefix == "sfpplus": contracts[f"{prefix}_{i:02d}"].update(portType="SFP+", nominalSpeed="10G")
    for name, slot, kind, connector in [
        ("mgmt_rj45", "MGMT", "management-port", "RJ45"),
        ("console_rj45", "CONSOLE-RJ45", "console-port", "RJ45"),
        ("console_microusb", "CONSOLE-MICROUSB", "console-port", "MicroUSB-B"),
        ("usb_type_a", "USB-A", "usb-port", "USB-A"),
    ]:
        assert names.count(name) == 1
        contracts[name] = dict(slot=slot, assetType=kind, portType=connector, selectable=True)
        counts[name] = 1
    contracts["S5232F_ROOT"] = dict(assetType="switch", manufacturer="Dell", model="PowerSwitch S5232F-ON", formFactor="1U", rackUnits=1, origin="bottom-center", selectable=True, physicalQsfp28Ports=32, physicalSfpPlusPorts=2, airflowMode="unspecified")
    for name, contract in contracts.items():
        assert all(by_name[name].get("extras", {}).get(k) == v for k, v in contract.items()), (name, contract)
    assert by_name["reset_button"]["extras"]["selectable"] is False
    forbidden = {"linkStatus", "utilization", "rxBytes", "txBytes", "rpm", "health", "powerDraw"}
    assert all(not forbidden.intersection(n.get("extras", {})) for n in nodes)
    assert all(all(abs(s - 1) < 1e-6 for s in n.get("scale", [1, 1, 1])) for n in nodes)
    transforms = {}
    def visit(index, parent):
        assert index not in transforms, "Duplicate/cyclic node"
        world = multiply(parent, matrix(nodes[index]))
        transforms[index] = world
        for child in nodes[index].get("children", []): visit(child, world)
    for index in doc["scenes"][0]["nodes"]: visit(index, matrix({}))
    assert len(transforms) == len(nodes)
    def bounds(indices):
        points = []
        for index in indices:
            node, world = nodes[index], transforms[index]
            if "mesh" not in node: continue
            for primitive in meshes[node["mesh"]]["primitives"]:
                a = accessors[primitive["attributes"]["POSITION"]]
                for corner in itertools.product(*zip(a["min"], a["max"])):
                    points.append([sum(world[r][c] * corner[c] for c in range(3)) + world[r][3] for r in range(3)])
        low = [min(p[a] for p in points) for a in range(3)]
        high = [max(p[a] for p in points) for a in range(3)]
        return low, high, [high[a] - low[a] for a in range(3)]
    body = bounds([names.index("chassis_shell"), names.index("top_panel")])
    overall = bounds(range(len(nodes)))
    for actual, expected in zip(body[2], (SPEC["width_m"], SPEC["height_m"], SPEC["depth_m"])):
        assert abs(actual - expected) < .00001, (body, expected)
    assert abs(overall[2][0] - SPEC["mounting_width_m"]) < .00001
    assert abs(overall[0][1]) < .00001
    for name in [f"qsfp28_{i:02d}" for i in range(1, 33)]:
        assert transforms[names.index(name)][2][3] > .22, "I/O must face glTF +Z"
    for name in ("psu_01", "fan_module_01", "mgmt_rj45"):
        assert transforms[names.index(name)][2][3] < -.22, "PSU must face glTF -Z"
    triangles = sum(sum(accessors[p["indices"]]["count"] // 3 for p in meshes[n["mesh"]]["primitives"]) for n in nodes if "mesh" in n)
    assert triangles < 50000, triangles
    assert len(data) < 4_000_000, len(data)
    # Cage geometry must really be shared after export, not only in Blender.
    assert len({by_name[f"qsfp28_{i:02d}_cage"]["mesh"] for i in range(1, 33)}) == 1
    assert len({by_name[f"fan_module_{i:02d}_body"]["mesh"] for i in range(1, 5)}) == 1
    return dict(chassis_mm_WDH=[round(body[2][i] * 1000, 3) for i in (0, 2, 1)],
                overall_mm_WDH=[round(overall[2][i] * 1000, 3) for i in (0, 2, 1)],
                nodes=len(nodes), unique_glb_meshes=len(meshes), triangles=triangles,
                glb_bytes=len(data), glb_mb=round(len(data) / 1_000_000, 3), counts=counts,
                rack_units=1, extras="VERIFIED", orientation="VERIFIED: Y-up, I/O +Z, PSU -Z")


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parents[2] / "public/assets/models/switches/powerswitch-s5232f-on.glb"
    print(json.dumps(validate_glb(path), indent=2))
