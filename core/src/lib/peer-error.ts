import { buildControlPacket, ControlPacket, ControlPacketType } from "./control-packet";

export type PeerError = {}

export const parsePeerError = ({ CIF }: ControlPacket): PeerError => {
  return {};
};

export const buildPeerError = (peererror: PeerError, timestamp: number, destination_socket_id: number): ArrayBuffer => {
  return buildControlPacket({
    F: 1,
    control_type: ControlPacketType.PEERERROR.ControlType,
    sub_type: ControlPacketType.PEERERROR.Subtype,
    type_specific_information: new ArrayBuffer(4),
    timestamp: timestamp,
    destination_socket_id: destination_socket_id,
    CIF: new ArrayBuffer(0)
  });
}