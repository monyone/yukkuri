export type DataPacket = {
  F: 1,
  packet_sequence_number: number,
  P: number,
  O: boolean,
  K: number,
  R: boolean,
  message_number: number,
  timestamp: number,
  destination_socket_id: number,
  data: ArrayBuffer
};

export const isDataPacket = (packet: ArrayBuffer): boolean => {
  const view = new DataView(packet);
  return (view.getUint8(0) & 0x80) === 0;
};

export const isFilterPacket = (packet: ArrayBuffer): boolean => {
  return parseDataPacket(packet).message_number === 0;
}

export const parseDataPacket = (packet: ArrayBuffer): DataPacket => {
  const view = new DataView(packet);

  const F = (view.getUint8(0) & 0x80) >>> 7;
  const packet_sequence_number = view.getUint32(0, false) & 0x7FFFFFFF;
  const P = (view.getUint8(4) & 0xC0) >>> 6;
  const O = (view.getUint8(4) & 0x20) !== 0;
  const K = (view.getUint8(4) & 0x18) >>> 4;
  const R = (view.getUint8(4) & 0x04) !== 0;
  const message_number = view.getUint32(4, false) & 0x03FFFFFF;
  const timestamp = view.getUint32(8, false);
  const destination_socket_id = view.getUint32(12, false);
  const data = packet.slice(16);

  return {
    F,
    packet_sequence_number,
    P,
    O,
    K,
    R,
    message_number,
    timestamp,
    destination_socket_id,
    data
  } as DataPacket;
};

export const buildDataPacket = (data_packet: DataPacket): ArrayBuffer => {
  const buffer = new ArrayBuffer(32 + data_packet.data.byteLength)
  const array = new Uint8Array(buffer);
  const view = new DataView(buffer);

  view.setUint32(0, data_packet.packet_sequence_number & 0x7FFFFFFF, false);
  view.setUint32(4, data_packet.message_number, false);
  view.setUint8(4, 
    ((data_packet.P & 0x03) << 6)
    | ((data_packet.O ? 1 : 0) << 4)
    | ((data_packet.K & 0x03) << 3)
    | ((data_packet.R ? 1 : 0) << 2)
    | ((data_packet.message_number & 0x03000000) >>> 24)
  );
  view.setUint32(8, data_packet.timestamp, false);
  view.setUint32(12, data_packet.destination_socket_id, false);
  array.set(new Uint8Array(data_packet.data), 32);

  return buffer;
}