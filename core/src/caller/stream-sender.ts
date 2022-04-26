import EventEmitter from "../event/eventemitter";
import { Events, EventTypes } from "../event/events";
import RingBuffer from "../buffer/ring-buffer";
import { DataPacket, buildDataPacket } from "../lib/data-packet";
import { isControlPacket, ControlPacketType, parseControlPacket } from "../lib/control-packet";
import { buildShutdown } from "../lib/shutdown";
import { HandshakeType, HandshakeExtentionType, HandshakeExtensionFieldBitmask, parseHandshake, buildHandshake } from "../lib/handshake";
import { parseNak } from "../lib/nak";
import { parseAck } from "../lib/ack";
import { buildAckAck } from "../lib/ackack";

const UINT31_RANGE = 2 ** 31;

enum HandshakeState {
  INITIAL,
  INDUCTIONING,
  CONCLUSIONING,
  ESTABLISHED
}

export type CallerStreamSenderOption = {
  socket_id: number
  initial_packet_sequence_number: number,
  maximum_transmission_unit_size: number,
  maximum_flow_window_size: number,
};

export default class CallSender {
  private options: CallerStreamSenderOption;

  private emitter: EventEmitter;

  private handshakeState: HandshakeState = HandshakeState.INITIAL;
  private readonly onSrtPacketRecievedHandler = this.onSrtPacketRecieved.bind(this);
  private readonly onDataSendRequestHandler = this.onDataSendRequest.bind(this);

  private destination_srt_socket_id: number | null = null;

  private sender_base_time: number = 0;
  private sender_sequence_number: number | null = null;

  private sender_buffer: RingBuffer<DataPacket> | null = null;

  public constructor(emitter: EventEmitter, options?: Partial<CallerStreamSenderOption>) {
    this.emitter = emitter;
    this.options = {
      socket_id: Math.floor(Math.random() * (2 ** 31)),
      initial_packet_sequence_number: Math.floor(Math.random() * (UINT31_RANGE - 1)),
      maximum_transmission_unit_size: 1316,
      maximum_flow_window_size: 8192,
      ... options
    }
  }

  private senderRelativeTimestamp(): number {
    return (performance.now() - this.sender_base_time) * 1000;
  }

  public start() {
    this.sender_base_time = performance.now();
    this.abort();

    this.sender_buffer = new RingBuffer<DataPacket>(8192, UINT31_RANGE);

    this.emitter.on(EventTypes.SRT_PACKET_RECIEVED, this.onSrtPacketRecievedHandler);
    this.emitter.on(EventTypes.DATA_SEND_REQUEST, this.onDataSendRequestHandler);
    this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
      event: EventTypes.SRT_PACKET_SEND,
      packet: buildHandshake({
        version: 4,
        encryption_field: 0,
        extension_field: 2,
        initial_packet_sequence_number: this.options.initial_packet_sequence_number,
        maximum_transmission_unit_size: this.options.maximum_transmission_unit_size,
        maximum_flow_window_size: this.options.maximum_flow_window_size,
        handshake_type: HandshakeType.INDUCTION,
        srt_socket_id: this.options.socket_id,
        syn_cookie: 0,
        peer_ip_address: new ArrayBuffer(16) // TODO
      }, this.senderRelativeTimestamp(), 0)
    });
    this.handshakeState = HandshakeState.INDUCTIONING;
  }

  public abort() {
    this.sender_buffer = null;
    this.sender_sequence_number = null;

    this.emitter.off(EventTypes.SRT_PACKET_RECIEVED, this.onSrtPacketRecievedHandler);
    this.emitter.off(EventTypes.DATA_SEND_REQUEST, this.onDataSendRequestHandler);

    if (!this.destination_srt_socket_id) { return; }
    this.emitter.off(EventTypes.SRT_PACKET_RECIEVED, this.onSrtPacketRecievedHandler);
    this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
      event: EventTypes.SRT_PACKET_SEND,
      packet: buildShutdown({}, this.senderRelativeTimestamp(), this.destination_srt_socket_id)
    });
    this.destination_srt_socket_id = null;
  }

  private onDataSendRequest({ packet }: Events[typeof EventTypes.DATA_SEND_REQUEST]) {
    if (this.destination_srt_socket_id == null) { return; }
    if (this.sender_buffer == null) { return; }
    if (this.sender_sequence_number == null) { return; }

    const size = this.options.maximum_transmission_unit_size - 16;
    for (let i = 0; i < packet.byteLength; i += size) {
      const data = packet.slice(i, i + size);
      const dataPacket = {
        F: 0,
        packet_sequence_number: this.sender_sequence_number,
        P: ((i === 0) ? (1 << 1) : 0) | ((i + size >= packet.byteLength) ? (1 << 0) : 0),
        O: true,
        K: 0,
        R: false,
        message_number: 1,
        timestamp: this.senderRelativeTimestamp(),
        destination_socket_id: this.destination_srt_socket_id,
        data
      } as const;

      this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
        event: EventTypes.SRT_PACKET_SEND,
        packet: buildDataPacket(dataPacket)
      });

      this.sender_buffer.push(dataPacket, this.sender_sequence_number);
      this.sender_sequence_number = (this.sender_sequence_number + 1) % UINT31_RANGE;
    }
  }

  private onSrtPacketRecieved({ packet }: Events[typeof EventTypes.SRT_PACKET_RECIEVED]) {
    if (isControlPacket(packet)) {
      const control = parseControlPacket(packet);

      if (control.control_type === ControlPacketType.SHUTDOWN.ControlType) {
        this.destination_srt_socket_id = null;
        this.abort();
        return;
      }

      switch(this.handshakeState) {
        case HandshakeState.INITIAL: {
          break;
        }
        case HandshakeState.INDUCTIONING: {
          if (control.control_type !== ControlPacketType.HANDSHAKE.ControlType) { return; }
          const { syn_cookie, maximum_transmission_unit_size, maximum_flow_window_size } = parseHandshake(control);
          this.options.maximum_transmission_unit_size = Math.min(this.options.maximum_transmission_unit_size, maximum_transmission_unit_size);
          this.options.maximum_flow_window_size = Math.min(this.options.maximum_flow_window_size, maximum_flow_window_size);

          const extension_content = new ArrayBuffer(12);
          const extension_view = new DataView(extension_content);
          extension_view.setUint32(0, 0x00104040, false);
          extension_view.setUint32(4, 0x000000bf, false);
          extension_view.setUint16(8, 0x0000, false); // TODO
          extension_view.setUint16(10, 0x0000, false);

          const handshake = buildHandshake({
            version: 5,
            encryption_field: 0,
            extension_field: HandshakeExtensionFieldBitmask.HSREQ,
            initial_packet_sequence_number: this.options.initial_packet_sequence_number,
            maximum_transmission_unit_size: this.options.maximum_transmission_unit_size,
            maximum_flow_window_size: this.options.maximum_flow_window_size,
            handshake_type: HandshakeType.CONCLUSION,
            srt_socket_id: this.options.socket_id,
            syn_cookie: syn_cookie,
            peer_ip_address: new ArrayBuffer(16),
            extension: [{
              extension_type: HandshakeExtentionType.SRT_CMD_HSREQ,
              extension_length: Math.floor(extension_content.byteLength / 4),
              extension_content: extension_content
            }]
          }, this.senderRelativeTimestamp(), 0);

          this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
            event: EventTypes.SRT_PACKET_SEND,
            packet: handshake
          });
          this.handshakeState = HandshakeState.CONCLUSIONING;
          break;
        }
        case HandshakeState.CONCLUSIONING: {
          if (control.control_type !== ControlPacketType.HANDSHAKE.ControlType) { return; }

          const { srt_socket_id, initial_packet_sequence_number } = parseHandshake(control);
          this.destination_srt_socket_id = srt_socket_id;
          this.sender_sequence_number = initial_packet_sequence_number;

          this.handshakeState = HandshakeState.ESTABLISHED;
          break;
        }
        case HandshakeState.ESTABLISHED: {
          if (this.destination_srt_socket_id == null) { break; }

          switch(control.control_type) {
            case ControlPacketType.ACK.ControlType: {
              const { acknowledgement_number } = parseAck(control);
              if (acknowledgement_number !== 0) {
                this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
                  event: EventTypes.SRT_PACKET_SEND,
                  packet: buildAckAck({ acknowledgement_number }, this.senderRelativeTimestamp(), this.destination_srt_socket_id)
                });
              }
              break;
            }
            case ControlPacketType.NAK.ControlType: {
              if (this.sender_buffer == null) { break; }

              const { loss_list } = parseNak(control);
              for (const loss of loss_list) {
                if (loss.range) {
                  const { range_from_sequence_number, range_to_sequence_number } = loss;
                  const size = ((range_to_sequence_number - range_from_sequence_number) + 1 + UINT31_RANGE) % UINT31_RANGE;

                  for (let i = 0; i < size; i++) {
                    const packet = this.sender_buffer.get((range_from_sequence_number + i) % UINT31_RANGE);
                    if (packet == null) { continue; }

                    this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
                      event: EventTypes.SRT_PACKET_SEND,
                      packet: buildDataPacket({ ... packet, O: false, destination_socket_id: this.destination_srt_socket_id, R: true })
                    });
                  }
                } else {
                  const packet = this.sender_buffer.get(loss.lost_packet_sequence_number);
                  if (packet == null) { continue; }

                  this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
                    event: EventTypes.SRT_PACKET_SEND,
                    packet: buildDataPacket({ ... packet, O: false, destination_socket_id: this.destination_srt_socket_id, R: true })
                  });
                }
              }

              break;
            }
          }
          break;
        }
      }
    }
  }
}
