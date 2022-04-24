import { buildControlPacket, ControlPacket, ControlPacketType } from "./control-packet";

export type Shutdown = {}

export const parseShutdown = ({ CIF }: ControlPacket): Shutdown => {
  return {};
};

export const buildShutdown = (shutdown: Shutdown, timestamp: number, destination_socket_id: number): ArrayBuffer => {
  return buildControlPacket({
    F: 1,
    control_type: ControlPacketType.SHUTDOWN.ControlType,
    sub_type: ControlPacketType.SHUTDOWN.Subtype,
    type_specific_information: new ArrayBuffer(4),
    timestamp: timestamp,
    destination_socket_id: destination_socket_id,
    CIF: new ArrayBuffer(0)
  });
}