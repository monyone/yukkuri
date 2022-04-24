import { DataPacket } from "../lib/data-packet";

export const EventTypes = {
  SRT_PACKET_RECIEVED: 'SRT_PACKET_RECIEVED',
  SRT_PACKET_SEND: 'SRT_PACKET_SEND',

  DATA_PACKET_RECIEVED_OR_DROPPED: 'DATA_PACKET_RECIEVED_OR_DROPPED'
} as const;

export type SRT_PACKET_RECIEVED_PAYLOAD = {
  event: typeof EventTypes.SRT_PACKET_RECIEVED,
  packet: ArrayBuffer
}

export type SRT_PACKET_SEND_PAYLOAD = {
  event: typeof EventTypes.SRT_PACKET_SEND,
  packet: ArrayBuffer
}

export type DATA_PACKET_RECIEVED_OR_DROPPED_PAYLOAD = {
  event: typeof EventTypes.DATA_PACKET_RECIEVED_OR_DROPPED,
  packet: DataPacket | null
}

export type Events = {
  [EventTypes.SRT_PACKET_RECIEVED]: SRT_PACKET_RECIEVED_PAYLOAD,
  [EventTypes.SRT_PACKET_SEND]: SRT_PACKET_SEND_PAYLOAD,

  [EventTypes.DATA_PACKET_RECIEVED_OR_DROPPED]: DATA_PACKET_RECIEVED_OR_DROPPED_PAYLOAD
}