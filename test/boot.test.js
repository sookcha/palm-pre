import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { createEmulator } from '../src/machine.js';

test('renders the Palm boot logo and opens Memos with the absolute pointer', { timeout: 300000 }, async t => {
  const disk = await stat('public/images/webos.img');
  const emulator = createEmulator({
    wasmPath: 'node_modules/v86/build/v86.wasm',
    videoBios: await readFile('public/bios/vgabios.bin'),
    assetRoot: 'public',
    diskSize: disk.size,
  });
  t.after(() => emulator.destroy());
  const deadline = Date.now() + 290000;
  const waitFor = async (check, message) => {
    while (Date.now() < deadline) {
      await setTimeout(250);
      if (check()) return;
    }
    assert.fail(message);
  };
  const pixel = (x, y) => {
    const pixels = emulator.v86.cpu.devices.vga.svga_memory;
    const offset = (y * 320 + x) * 4;
    return [pixels[offset + 2], pixels[offset + 1], pixels[offset]];
  };
  const tap = async (x, y) => {
    emulator.pointer.send(x, y, true);
    await setTimeout(150);
    emulator.pointer.send(x, y, false);
  };
  await waitFor(() => {
    const display = emulator.v86.cpu.devices.vga;
    if (display?.svga_width !== 320 || display.svga_height !== 480 || display.svga_bpp !== 32) return false;
    const whites = [[108, 240], [110, 230], [143, 230], [181, 230]];
    return whites.every(([x, y]) => pixel(x, y)[2] >= 220)
      && pixel(30, 100)[2] === 0
      && pixel(160, 200)[2] < 30;
  }, 'Expected the Palm wordmark on a black 320×480 framebuffer');
  await waitFor(() => {
    const [r, g, b] = pixel(30, 100);
    return g > 30 && g > r && g > b;
  }, 'Expected the webOS launcher wallpaper');
  await setTimeout(3000);
  await tap(285, 445);
  await waitFor(() => {
    const rgb = pixel(15, 200);
    return rgb.every(value => value > 70 && value < 210)
      && Math.max(...rgb) - Math.min(...rgb) < 25;
  }, 'Expected the app launcher after tapping its dock icon');
  await setTimeout(1000);
  await tap(60, 280);
  await waitFor(() => [[160, 240], [20, 300], [300, 400]].every(([x, y]) => {
    const [r, g, b] = pixel(x, y);
    return r > 100 && r > g + 20 && g > b + 20;
  }), 'Expected the Memos corkboard after tapping the app icon');
});
