import { buildControlPacket, ControlPacket, ControlPacketType } from "./control-packet";

export type FullAck = {
  acknowledgement_number: number,
  last_acknowledged_packet_sequence_number: number,
  rtt: number,
  rtt_variance: number,
  available_buffer_size: number,
  packets_recieving_rate: number,
  estimated_link_capacity: number,
  recieving_rate: number
};

export type LightAck = {
  acknowledgement_number: 0,
  last_acknowledged_packet_sequence_number: number,
};

export type SmallAck = LightAck & {
  rtt: number,
  rtt_variance: number,
  available_buffer_size: number,
};

export type Ack = FullAck | LightAck | SmallAck;

export const parseAck = ({ CIF, type_specific_information }: ControlPacket): Ack => {
  const acknowledgement_number = (new Uint32Array(type_specific_information)[0]);

  if (acknowledgement_number === 0) {
    const view = new DataView(CIF);
    
    const last_acknowledged_packet_sequence_number = view.getUint32(0, false);
    if (CIF.byteLength > 4) { // small Ack
      const rtt = view.getUint32(4, false);
      const rtt_variance = view.getUint32(8, false);
      const available_buffer_size = view.getUint32(12, false);
    
      return {
        acknowledgement_number: 0,
        last_acknowledged_packet_sequence_number,
        rtt,
        rtt_variance,
        available_buffer_size
      };
    } else { // light Ack
      return {
        acknowledgement_number: 0,
        last_acknowledged_packet_sequence_number,
      };
    }
  } else {
    const view = new DataView(CIF);
    
    const last_acknowledged_packet_sequence_number = view.getUint32(0, false);
    const rtt = view.getUint32(4, false);
    const rtt_variance = view.getUint32(8, false);
    const available_buffer_size = view.getUint32(12, false);
    const packets_recieving_rate = view.getUint32(16, false);
    const estimated_link_capacity = view.getUint32(20, false);
    const recieving_rate = view.getUint32(24, false);

    return {
      acknowledgement_number,
      last_acknowledged_packet_sequence_number,
      rtt,
      rtt_variance,
      available_buffer_size,
      packets_recieving_rate,
      estimated_link_capacity,
      recieving_rate
    };
  }
};

export const buildFullAck = (fullAck: FullAck, timestamp: number, destination_socket_id: number): ArrayBuffer => {
  const CIF = new ArrayBuffer(28);
  const view = new DataView(CIF);

  view.setUint32(0, fullAck.last_acknowledged_packet_sequence_number, false);
  view.setUint32(4, fullAck.rtt, false);
  view.setUint32(8, fullAck.rtt_variance, false);
  view.setUint32(12, fullAck.available_buffer_size, false),
  view.setUint32(16, fullAck.packets_recieving_rate, false);
  view.setUint32(20, fullAck.estimated_link_capacity, false);
  view.setUint32(24, fullAck.recieving_rate, false);

  const type_specific_information = new ArrayBuffer(4);
  const type_specific_information_view = new DataView(type_specific_information);
  type_specific_information_view.setUint32(0, fullAck.acknowledgement_number, false);

  return buildControlPacket({
    F: 1,
    control_type: ControlPacketType.ACK.ControlType,
    sub_type: ControlPacketType.ACK.Subtype,
    type_specific_information: type_specific_information,
    timestamp: timestamp,
    destination_socket_id: destination_socket_id,
    CIF
  });
}

export const buildLightAck = (lightAck: LightAck, timestamp: number, destination_socket_id: number): ArrayBuffer => {
  const CIF = new ArrayBuffer(4);
  const view = new DataView(CIF);

  view.setUint32(0, lightAck.last_acknowledged_packet_sequence_number, false);

  const type_specific_information = new ArrayBuffer(4);
  const type_specific_information_view = new DataView(type_specific_information);
  type_specific_information_view.setUint32(0, lightAck.acknowledgement_number, false);

  return buildControlPacket({
    F: 1,
    control_type: ControlPacketType.ACK.ControlType,
    sub_type: ControlPacketType.ACK.Subtype,
    type_specific_information: type_specific_information,
    timestamp: timestamp,
    destination_socket_id: destination_socket_id,
    CIF
  });
}

export const buildSmallAck = (smallAck: SmallAck, timestamp: number, destination_socket_id: number): ArrayBuffer => {
  const CIF = new ArrayBuffer(16);
  const view = new DataView(CIF);

  view.setUint32(0, smallAck.last_acknowledged_packet_sequence_number, false);
  view.setUint32(4, smallAck.rtt, false);
  view.setUint32(8, smallAck.rtt_variance, false);
  view.setUint32(12, smallAck.available_buffer_size, false);

  const type_specific_information = new ArrayBuffer(4);
  const type_specific_information_view = new DataView(type_specific_information);
  type_specific_information_view.setUint32(0, smallAck.acknowledgement_number, false);

  return buildControlPacket({
    F: 1,
    control_type: ControlPacketType.ACK.ControlType,
    sub_type: ControlPacketType.ACK.Subtype,
    type_specific_information: type_specific_information,
    timestamp: timestamp,
    destination_socket_id: destination_socket_id,
    CIF
  });
}