import { createEmulator } from './machine.js';
import { bindPointer } from './pointer.js';
import wasmPath from 'v86/build/v86.wasm?url';
import './style.css';

const status = document.querySelector('#status');
const start = document.querySelector('#start');
const screen = document.querySelector('#screen');
const assetRoot = import.meta.env.BASE_URL.replace(/\/$/, '');

start.addEventListener('click', async () => {
  start.disabled = true;
  status.textContent = 'Loading emulator…';
  try {
    const response = await fetch(`${assetRoot}/images/webos.img`, { method: 'HEAD' });
    if (!response.ok || !response.headers.get('content-type')?.includes('octet-stream')) {
      throw new Error('Missing public/images/webos.img. Supply the converted webOS SDK disk image.');
    }
    const biosResponse = await fetch(`${assetRoot}/bios/vgabios.bin`);
    if (!biosResponse.ok) throw new Error('Unable to load the video BIOS.');
    const emulator = window.emulator = createEmulator({
      wasmPath,
      assetRoot,
      videoBios: await biosResponse.arrayBuffer(),
      screen,
      diskSize: Number(response.headers.get('content-length')),
    });
    emulator.add_listener('emulator-ready', () => bindPointer(screen.querySelector('canvas'), emulator.pointer));
    screen.addEventListener('focus', () => emulator.keyboard_set_enabled(true));
    screen.addEventListener('blur', () => emulator.keyboard_set_enabled(false));
    emulator.add_listener('emulator-started', () => {
      status.textContent = 'Emulator running. webOS startup can take several minutes.';
      document.querySelectorAll('[data-key]').forEach(button => {
        button.disabled = false;
        button.addEventListener('click', () => {
          screen.focus();
          emulator.keyboard_send_keys([Number(button.dataset.key)]);
        });
      });
      screen.focus();
    });
  } catch (error) {
    status.textContent = error.message;
    start.disabled = false;
  }
});
