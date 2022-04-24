import dgram from 'dgram';

import { EventEmitter, EventTypes } from 'yukkuri';
import { CallerStreamReader } from 'yukkuri';

const socket = dgram.createSocket({
  type: 'udp4',
});
const own_socket_id = 1024;

const emitter = new EventEmitter();
const reader = new CallerStreamReader(emitter, {
  socket_id: own_socket_id,
  maximum_transmission_unit_size: 1256
})
socket.bind(12345);
emitter.on(EventTypes.SRT_PACKET_SEND, ({ packet }) => {
  socket.send(new Uint8Array(packet), 6666, 'localhost');
});
emitter.on(EventTypes.DATA_PACKET_RECIEVED_OR_DROPPED, ({ packet }) => {
  if (!packet) { return; }
  process.stdout.write(Buffer.from(packet.data));
})
socket.on('message', (message: Buffer) => {
  emitter.emit(EventTypes.SRT_PACKET_RECIEVED, {
    event: EventTypes.SRT_PACKET_RECIEVED,
    packet: message.buffer
  });
});
reader.start();