import { V86 } from 'v86';
import { VirtualBoxPointer } from './pointer.js';

export function createEmulator({ wasmPath, videoBios, assetRoot = '', screen, diskSize }) {
  const bios = new Uint8Array(videoBios);
  bios.set([0x40, 0x01], 0x505a);
  bios[0x8dff] += 0x41;
  const emulator = new V86({
    wasm_path: wasmPath,
    memory_size: 256 * 1024 * 1024,
    vga_memory_size: 8 * 1024 * 1024,
    screen_container: screen,
    disable_mouse: true,
    bios: { url: `${assetRoot}/bios/seabios.bin` },
    vga_bios: { buffer: bios.buffer },
    bzimage: { url: `${assetRoot}/images/bzImage` },
    cmdline: 'root=/dev/hda1 rw console=tty0 video=vesafb:ypan',
    hda: { url: `${assetRoot}/images/webos.img`, async: true, size: diskSize, fixed_chunk_size: 64 * 1024 },
    autostart: false,
  });
  emulator.add_listener('emulator-ready', () => {
    const memory = emulator.v86.cpu.mem8;
    memory.set([0x42, 0x03], 0x801fa);
    emulator.pointer = new VirtualBoxPointer(emulator);
    const disk = emulator.v86.cpu.devices.ide.primary.master.buffer;
    disk.get(403220224, 256, bytes => {
      const patched = bytes.slice();
      patched[157] = 0x31;
      disk.set(403220224, patched, () => emulator.run());
    });
  });
  return emulator;
}
