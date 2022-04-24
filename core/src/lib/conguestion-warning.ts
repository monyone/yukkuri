import { buildControlPacket, ControlPacket, ControlPacketType } from "./control-packet";

export type ConguestionWarning = {}

export const parseConguestionWarning = ({ CIF }: ControlPacket): ConguestionWarning => {
  return {};
};

export const buildConguestionWarning = (conguestion_warning: ConguestionWarning, timestamp: number, destination_socket_id: number): ArrayBuffer => {
  return buildControlPacket({
    F: 1,
    control_type: ControlPacketType.CONGUESTION_WARNING.ControlType,
    sub_type: ControlPacketType.CONGUESTION_WARNING.Subtype,
    type_specific_information: new ArrayBuffer(4),
    timestamp: timestamp,
    destination_socket_id: destination_socket_id,
    CIF: new ArrayBuffer(0)
  });
}