import { buildControlPacket, ControlPacket, ControlPacketType } from "./control-packet";

export type MessageDropRequest = {
  message_number: number,
  first_packet_sequence_number: number,
  last_packet_sequence_number: number
}

export const parseMessageDropRequest = ({ CIF, type_specific_information }: ControlPacket): MessageDropRequest => {
  const view = new DataView(CIF);
  const type_specific_information_view = new DataView(type_specific_information);

  return {
    message_number: type_specific_information_view.getUint32(0, false),
    first_packet_sequence_number: view.getUint32(0, false),
    last_packet_sequence_number: view.getUint32(4, false)
  }
};

export const buildMessageDropRequest = (message_drop_request: MessageDropRequest, timestamp: number, destination_socket_id: number): ArrayBuffer => {
  const CIF = new ArrayBuffer(8);
  const view = new DataView(CIF);
  view.setUint32(0, message_drop_request.first_packet_sequence_number, false);
  view.setUint32(4, message_drop_request.last_packet_sequence_number, false);

  const type_specific_information = new ArrayBuffer(4);
  const type_specific_information_view = new DataView(type_specific_information);
  type_specific_information_view.setUint32(0, message_drop_request.message_number, false);

  return buildControlPacket({
    F: 1,
    control_type: ControlPacketType.DROPREQ.ControlType,
    sub_type: ControlPacketType.DROPREQ.Subtype,
    type_specific_information: type_specific_information,
    timestamp: timestamp,
    destination_socket_id: destination_socket_id,
    CIF,
  });
}