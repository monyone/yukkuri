import { buildControlPacket, ControlPacket, ControlPacketType } from "./control-packet";

export type KeepAlive = {}

export const parseKeepAlive = ({ CIF }: ControlPacket): KeepAlive => {
  return {};
};

export const buildKeepAlive = (keepalive: KeepAlive, timestamp: number, destination_socket_id: number): ArrayBuffer => {
  return buildControlPacket({
    F: 1,
    control_type: ControlPacketType.KEEPALIVE.ControlType,
    sub_type: ControlPacketType.KEEPALIVE.Subtype,
    type_specific_information: new ArrayBuffer(4),
    timestamp: timestamp,
    destination_socket_id: destination_socket_id,
    CIF: new ArrayBuffer(0)
  });
}