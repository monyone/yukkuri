import { buildControlPacket, ControlPacket, ControlPacketType } from "./control-packet";

export type HandshakeExtention = {
  extension_type: number,
  extension_length: number,
  extension_content: ArrayBuffer
}

export enum HandshakeEncryptionField {
  NoEncryptionAdvertised = 0,
  AES128 = 2,
  AES192 = 3,
  AES256 = 4
}

export enum HandshakeExtensionFieldBitmask {
  HSREQ = 0x00000001,
  KMREQ = 0x00000002,
  CONFIG = 0x00000004
}

export enum HandshakeExtentionType {
  SRT_CMD_HSREQ = 1,
  SRT_CMD_HSRSP = 2,
  SRT_CMD_KMREQ	= 3,
  SRT_CMD_KMRSP	= 4,
  SRT_CMD_SID = 5,
  SRT_CMD_CONGESTION = 6,
  SRT_CMD_FILTER = 7,
  SRT_CMD_GROUP = 8
}

export enum HandshakeExtensionMessageFlag {
  TSBPDSND = 0x00000001,
  TSBPDRCV = 0x00000002,
  CRYPT = 0x00000004,
  TLPKTDROP = 0x00000008,
  PERIODICNAK = 0x00000010,
  REXMITFLG = 0x00000020,
  STREAM = 0x00000040,
  PACKET_FILTER = 0x00000080
}

export enum HandshakeType {
  DONE = 0xFFFFFFFD,
  AGREEMENT = 0xFFFFFFFE,
  CONCLUSION = 0xFFFFFFFF,
  WAVEHAND = 0x00000000,
  INDUCTION = 0x00000001
}

export type Handshake = {
  version: number,
  encryption_field: HandshakeEncryptionField,
  extension_field: number,
  initial_packet_sequence_number: number,
  maximum_transmission_unit_size: number,
  maximum_flow_window_size: number,
  handshake_type: HandshakeType,
  srt_socket_id: number,
  syn_cookie: number,
  peer_ip_address: ArrayBuffer,
  extension?: HandshakeExtention[]
}

export const parseHandshake = ({ CIF }: ControlPacket): Handshake => {
  const view = new DataView(CIF);

  const version = view.getUint32(0, false);
  const encryption_field = view.getUint16(4, false);
  const extension_field = view.getUint16(6, false);
  const initial_packet_sequence_number = view.getUint32(8, false);
  const maximum_transmission_unit_size = view.getUint32(12, false);
  const maximum_flow_window_size = view.getUint32(16, false);
  const handshake_type = view.getUint32(20, false);  
  const srt_socket_id = view.getUint32(24, false);
  const syn_cookie = view.getUint32(28, false);
  const peer_ip_address = CIF.slice(32, 48);
  const extension = [];
  for (let i = 48; i < CIF.byteLength; ) {
    const extension_type = view.getUint16(i + 0, false)
    const extension_length = view.getUint16(i + 2, false);
    const extension_content = CIF.slice(i + 4, i + 4 + extension_length * 4);

    extension.push({
      extension_type,
      extension_length,
      extension_content
    });

    i += 4 + extension_length * 4;
  }

  return {
    version,
    encryption_field,
    extension_field,
    initial_packet_sequence_number,
    maximum_transmission_unit_size,
    maximum_flow_window_size,
    handshake_type,
    srt_socket_id,
    syn_cookie,
    peer_ip_address,
    extension
  };
};

export const buildHandshake = (handshake: Handshake, timestamp: number, destination_socket_id: number): ArrayBuffer => {
  let all_extension_length = 0;
  for (const { extension_content } of (handshake.extension ?? [])) {
    all_extension_length += 4 + extension_content.byteLength;
  }

  const extention_buffer = new ArrayBuffer(all_extension_length);
  {
    const view = new DataView(extention_buffer);
    const array = new Uint8Array(extention_buffer);
    let index = 0;
    for (const { extension_type, extension_length, extension_content } of (handshake.extension ?? [])) {
      view.setUint16(index + 0, extension_type, false);
      view.setUint16(index + 2, extension_length, false);
      array.set(new Uint8Array(extension_content), index + 4);
      index += 4 + extension_content.byteLength;
    }
  }

  const CIF = new ArrayBuffer(48 + extention_buffer.byteLength);
  const view = new DataView(CIF);
  const array = new Uint8Array(CIF);

  view.setUint32(0, handshake.version, false);
  view.setUint16(4, handshake.encryption_field, false);
  view.setUint16(6, handshake.extension_field, false);
  view.setUint32(8, handshake.initial_packet_sequence_number, false);
  view.setUint32(12, handshake.maximum_transmission_unit_size, false);
  view.setUint32(16, handshake.maximum_flow_window_size, false);
  view.setUint32(20, handshake.handshake_type, false);
  view.setUint32(24, handshake.srt_socket_id, false);
  view.setUint32(28, handshake.syn_cookie, false);
  array.set(new Uint8Array(handshake.peer_ip_address), 32);
  array.set(new Uint8Array(extention_buffer), 48);

  return buildControlPacket({
    F: 1,
    control_type: ControlPacketType.HANDSHAKE.ControlType,
    sub_type: ControlPacketType.HANDSHAKE.Subtype,
    type_specific_information: new ArrayBuffer(4),
    timestamp: timestamp,
    destination_socket_id: destination_socket_id,
    CIF
  });
}