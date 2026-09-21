import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("embeds bounded PBR maps for both PCBs without changing the hardware envelope", () => {
  const binary = readFileSync("public/assets/models/servers/poweredge-xe7745.glb");
  const doc = JSON.parse(binary.subarray(20, 20 + binary.readUInt32LE(12)).toString());
  expect(doc.images).toHaveLength(6);
  expect(binary.length).toBeLessThan(5_000_000);
  for (const image of doc.images) {
    expect(image.uri).toBeUndefined();
    expect(image.mimeType).toBe("image/png");
    const view = doc.bufferViews[image.bufferView];
    const offset = 20 + binary.readUInt32LE(12) + 8 + (view.byteOffset ?? 0);
    expect(binary.subarray(offset, offset + 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(binary.readUInt32BE(offset + 16)).toBe(1024);
    expect(binary.readUInt32BE(offset + 20)).toBe(2048);
  }
  for (const suffix of ["CPU", "GPU"]) {
    const material = doc.materials.find((m: { name: string }) => m.name === `MAT_BOARD_GREEN_${suffix}`);
    expect(material).toBeDefined();
    const pbr = material.pbrMetallicRoughness;
    expect(pbr.baseColorTexture).toBeDefined();
    expect(pbr.metallicRoughnessTexture).toBeDefined();
    expect(material.normalTexture).toBeDefined();
    expect(material.occlusionTexture.index).toBe(pbr.metallicRoughnessTexture.index);
    expect(material.extras.finish).toBe("muted-teal-pcb");
    expect(material.extras.markings).toBe("decorative-not-oem");
  }
  for (const mesh of doc.meshes)
    for (const primitive of mesh.primitives)
      if (doc.materials[primitive.material].name.match(/^MAT_BOARD_GREEN_(CPU|GPU)$/))
        expect(primitive.attributes.TEXCOORD_0).toBeDefined();
});
