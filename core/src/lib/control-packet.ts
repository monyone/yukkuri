export const ControlPacketType = {
  HANDSHAKE: {
    ControlType: 0x0000,
    Subtype: 0x0
  },
  KEEPALIVE: {
    ControlType: 0x0001,
    Subtype: 0x0
  },
  ACK: {
    ControlType: 0x0002,
    Subtype: 0x0
  },
  NAK: {
    ControlType: 0x0003,
    Subtype: 0x0
  },
  CONGUESTION_WARNING: {
    ControlType: 0x0004,
    Subtype: 0x0
  },
  SHUTDOWN: {
    ControlType: 0x0005,
    Subtype: 0x0
  },
  ACKACK: {
    ControlType: 0x0006,
    Subtype: 0x0
  },
  DROPREQ: {
    ControlType: 0x0007,
    Subtype: 0x0
  },
  PEERERROR: {
    ControlType: 0x0008,
    Subtype: 0x0
  },
  USER_DEFINED_TYPE: {
    ControlType: 0x7FFF
  },
} as const;

export type ControlPacketTypes = (typeof ControlPacketType.HANDSHAKE.ControlType)
  | (typeof ControlPacketType.KEEPALIVE.ControlType)
  | (typeof ControlPacketType.ACK.ControlType)
  | (typeof ControlPacketType.NAK.ControlType)
  | (typeof ControlPacketType.CONGUESTION_WARNING.ControlType)
  | (typeof ControlPacketType.SHUTDOWN.ControlType)
  | (typeof ControlPacketType.ACKACK.ControlType)
  | (typeof ControlPacketType.DROPREQ.ControlType)
  | (typeof ControlPacketType.PEERERROR.ControlType)
  | (typeof ControlPacketType.USER_DEFINED_TYPE.ControlType);

export type ControlPacket = {
  F: 1,
  control_type: ControlPacketTypes,
  sub_type: number,
  type_specific_information: ArrayBuffer,
  timestamp: number,
  destination_socket_id: number,
  CIF: ArrayBuffer
};

export const isControlPacket = (packet: ArrayBuffer): boolean => {
  const view = new DataView(packet);
  return (view.getUint8(0) & 0x80) !== 0;
};

export const parseControlPacket = (packet: ArrayBuffer): ControlPacket => {
  const view = new DataView(packet);

  const F = (view.getUint8(0) & 0x80) >>> 7;
  const control_type = view.getUint16(0) & 0x7FFF;
  const sub_type = view.getUint16(2, false);
  const type_specific_information = packet.slice(4, 8);
  const timestamp = view.getUint32(8, false);
  const destination_socket_id = view.getUint32(12, false);
  const CIF = packet.slice(16);

  return {
    F,
    control_type,
    sub_type,
    type_specific_information,
    timestamp,
    destination_socket_id,
    CIF
  } as ControlPacket
};

export const buildControlPacket = (control_packet: ControlPacket): ArrayBuffer => {
  const buffer = new ArrayBuffer(16 + control_packet.CIF.byteLength)
  const array = new Uint8Array(buffer);
  const view = new DataView(buffer);

  view.setUint16(0, control_packet.control_type | 0x8000, false);
  view.setUint16(2, control_packet.sub_type, false);
  array.set(new Uint8Array(control_packet.type_specific_information), 4);
  view.setUint32(8, control_packet.timestamp, false);
  view.setUint32(12, control_packet.destination_socket_id, false);
  array.set(new Uint8Array(control_packet.CIF), 16);

  return buffer;
};