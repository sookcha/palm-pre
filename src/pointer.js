const RAM_ADDRESS = 0xe1000000;
const RAM_SIZE = 4 * 1024 * 1024;
const REQUEST_PORT = 0x500;

export class VirtualBoxPointer {
  constructor(emulator) {
    this.emulator = emulator;
    this.cpu = emulator.v86.cpu;
    this.x = 0;
    this.y = 0;
    this.features = 2;
    this.events = 0;
    this.eventMask = 0;
    this.ram = new Uint8Array(RAM_SIZE);
    this.ramView = new DataView(this.ram.buffer);
    this.ramView.setUint32(0, RAM_SIZE, true);
    this.ramView.setUint32(4, 1, true);
    this.name = 'webOS absolute pointer';
    this.pci_id = 7 << 3;
    this.pci_space = new Uint8Array(64);
    const pci = new DataView(this.pci_space.buffer);
    pci.setUint16(0, 0x80ee, true);
    pci.setUint16(2, 0xcafe, true);
    pci.setUint16(4, 3, true);
    pci.setUint16(10, 0x0880, true);
    pci.setUint32(16, REQUEST_PORT | 1, true);
    pci.setUint32(20, RAM_ADDRESS, true);
    this.pci_space[0x3c] = 11;
    this.pci_space[0x3d] = 1;
    this.pci_bars = [{ size: 32 }, { size: RAM_SIZE }];
    this.cpu.io.register_write(REQUEST_PORT, this, undefined, undefined, address => this.request(address >>> 0));
    this.cpu.io.mmap_register(RAM_ADDRESS, RAM_SIZE,
      address => this.ram[(address >>> 0) - RAM_ADDRESS],
      (address, value) => { this.ram[(address >>> 0) - RAM_ADDRESS] = value; },
      address => this.ramView.getInt32((address >>> 0) - RAM_ADDRESS, true),
      (address, value) => this.ramView.setInt32((address >>> 0) - RAM_ADDRESS, value, true));
    this.cpu.devices.pci.register_device(this);
  }

  request(address) {
    const memory = this.cpu.mem8;
    if (address > memory.length - 24) return;
    const header = new DataView(memory.buffer, memory.byteOffset + address, 24);
    const size = header.getUint32(0, true);
    const type = header.getUint32(8, true);
    if (size < 24 || size > 1048576 || size > memory.length - address) return;
    const packet = new DataView(memory.buffer, memory.byteOffset + address, size);
    let result = 0;
    switch (type) {
      case 1:
        if (size !== 36) { result = -2; break; }
        packet.setUint32(24, this.features, true);
        packet.setUint32(28, this.x, true);
        packet.setUint32(32, this.y, true);
        break;
      case 2:
        if (size !== 36) { result = -2; break; }
        this.features = (packet.getUint32(24, true) & 5) | 2;
        break;
      case 3:
      case 50:
      case 56:
        break;
      case 10:
        if (size !== 32) { result = -2; break; }
        packet.setBigUint64(24, BigInt(Date.now()), true);
        break;
      case 20:
        if (size !== 32) { result = -2; break; }
        packet.setUint32(24, 0, true);
        packet.setUint32(28, 0, true);
        break;
      case 41:
        if (size !== 28) { result = -2; break; }
        packet.setUint32(24, this.events & this.eventMask, true);
        this.events = 0;
        this.ram[8] = 0;
        this.cpu.devices.pci.lower_irq(this.pci_id);
        break;
      case 42:
        if (size !== 32) { result = -2; break; }
        this.eventMask = (this.eventMask | packet.getUint32(24, true)) & ~packet.getUint32(28, true);
        break;
      default:
        result = -37;
    }
    packet.setInt32(12, result, true);
  }

  send(x, y, down) {
    this.x = Math.ceil(Math.max(0, Math.min(319, x)) / 320 * 65535);
    this.y = Math.ceil(Math.max(0, Math.min(479, y)) / 480 * 65535);
    this.emulator.bus.send('mouse-delta', [1, 0]);
    this.emulator.bus.send('mouse-click', [down, false, false]);
  }
}

export function bindPointer(canvas, pointer) {
  let activePointer = null;
  let position;
  const send = (event, down) => {
    const bounds = canvas.getBoundingClientRect();
    position = [(event.clientX - bounds.left) * 320 / bounds.width,
      (event.clientY - bounds.top) * 480 / bounds.height];
    pointer.send(...position, down);
    event.preventDefault();
  };
  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || activePointer !== null) return;
    activePointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    canvas.parentElement.focus();
    send(event, true);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId === activePointer) send(event, true);
  });
  const release = event => {
    if (event.pointerId !== activePointer) return;
    if (event.type === 'pointerup') send(event, false);
    else pointer.send(...position, false);
    activePointer = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
}
