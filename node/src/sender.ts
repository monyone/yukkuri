import dgram from 'dgram';
import { Writable } from 'stream';

import { EventEmitter, EventTypes, isDataPacket, parseDataPacket } from 'yukkuri';
import { CallerStreamSender } from 'yukkuri';

const socket = dgram.createSocket({
  type: 'udp4',
});
const own_socket_id = 1024;

const emitter = new EventEmitter();
const sender = new CallerStreamSender(emitter, {
  socket_id: own_socket_id,
  maximum_transmission_unit_size: 1256
})
socket.bind(12345);
const queue: Buffer[] = [];
let ascendant: Buffer = Buffer.from([]);
process.stdin.pipe(new Writable({
  write(chunk: Buffer, encoding, callback) {
    const processing = Buffer.concat([ascendant, chunk]);
    let lastSyncBytePosition = -1;
    for (let i = 0; i < processing.length; i++) {
      if (processing[i] != 0x47) { continue; }

      lastSyncBytePosition = i;
      if (i + 188 <= processing.length) {
        queue.push(processing.slice(i, i + 188));
        lastSyncBytePosition = -1;
      }
      
      i += 188 - 1;
    }

    for (let i = 0; i + 6 < queue.length; i += 6) {
      const concat = Buffer.concat([
        queue.shift()!, queue.shift()!, queue.shift()!, queue.shift()!, queue.shift()!, queue.shift()!,
      ]);
      emitter.emit(EventTypes.DATA_SEND_REQUEST, {
        event: EventTypes.DATA_SEND_REQUEST,
        packet: (new Uint8Array(concat)).buffer
      });
    }

    if (lastSyncBytePosition >= 0) {
      ascendant = processing.slice(lastSyncBytePosition);
    } else {
      ascendant = Buffer.from([]);
    }
    callback();
  }
}));

emitter.on(EventTypes.SRT_PACKET_SEND, ({ packet }) => {
  socket.send(new Uint8Array(packet), 6666, 'localhost')
});

socket.on('message', (message: Buffer) => {
  emitter.emit(EventTypes.SRT_PACKET_RECIEVED, {
    event: EventTypes.SRT_PACKET_RECIEVED,
    packet: message.buffer
  });
});
sender.start();