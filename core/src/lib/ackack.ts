import { buildControlPacket, ControlPacket, ControlPacketType } from "./control-packet";

export type AckAck = {
  acknowledgement_number: number,
}

export const parseAckAck = ({ CIF, type_specific_information }: ControlPacket): AckAck => {
  const view = new DataView(type_specific_information);
  return {
    acknowledgement_number: view.getUint32(0, false)
  };
};

export const buildAckAck = (ackack: AckAck, timestamp: number, destination_socket_id: number): ArrayBuffer => {
  const type_specific_information = new ArrayBuffer(4);
  const type_specific_information_view = new DataView(type_specific_information);
  type_specific_information_view.setUint32(0, ackack.acknowledgement_number, false);

  return buildControlPacket({
    F: 1,
    control_type: ControlPacketType.ACKACK.ControlType,
    sub_type: ControlPacketType.ACKACK.Subtype,
    type_specific_information: type_specific_information,
    timestamp: timestamp,
    destination_socket_id: destination_socket_id,
    CIF: new ArrayBuffer(0)
  });
}