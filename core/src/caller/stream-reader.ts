import { DataPacket, isDataPacket, isFilterPacket, parseDataPacket } from "../lib/data-packet";
import { isControlPacket, ControlPacketType, parseControlPacket } from "../lib/control-packet";
import { HandshakeType, HandshakeExtentionType, HandshakeExtensionFieldBitmask, parseHandshake, buildHandshake } from '../lib/handshake'
import { buildKeepAlive } from "../lib/keepalive";
import { FullAck, buildFullAck } from "../lib/ack";
import { buildNak } from "../lib/nak";
import { parseAckAck } from "../lib/ackack";
import { buildShutdown } from "../lib/shutdown";

import EventEmitter from "../event/eventemitter";
import { Events, EventTypes } from "../event/events";
import RingBuffer from "../buffer/ring-buffer";

const UINT31_RANGE = 2 ** 31;

type FullAckWithTimestamp = FullAck & { timestamp: number };
export type Stat = Partial<FullAck> & {
  acknowledgement_number: number,
  rtt: number,
  rtt_variance: number,
  acknowledgement_buffer?: RingBuffer<FullAckWithTimestamp>
};

enum HandshakeState {
  INITIAL,
  INDUCTIONING,
  CONCLUSIONING,
  ESTABLISHED
}

export type CallerStreamReaderOption = {
  socket_id: number,
  maximum_transmission_unit_size: number,
  maximum_flow_window_size: number,
}

export default class CallReader {
  private options: CallerStreamReaderOption;

  private emitter: EventEmitter;
  private readonly onSrtPacketRecievedHandler = this.onSrtPacketRecieved.bind(this);
  private readonly onSrtPeriodicFullAckHandler = this.onSrtPeriodicFullAck.bind(this);
  private readonly onSrtPeriodicNakHandler = this.onSrtPeriodicNak.bind(this);
  private readonly onSrtPeriodicKeepAliveHandler = this.onSrtPeriodicKeepAlive.bind(this);

  private handshakeState: HandshakeState = HandshakeState.INITIAL;

  private destination_srt_socket_id: number | null = null;
  private fullack_interval_id: number | null = null;
  private nak_timeout_id: number | null = null;
  private keepalive_interval_id: number | null = null;

  private base_timestamp: number = 0;
  private stat: Stat = {
    acknowledgement_number: 1,
    rtt: 100 * 1000,
    rtt_variance: 50 * 1000
  }
  private recieve_buffer: RingBuffer<DataPacket> | null = null;

  public constructor(emitter: EventEmitter, options?: Partial<CallerStreamReaderOption>) {
    this.emitter = emitter;
    this.options = {
      socket_id: Math.floor(Math.random() * (2 ** 31)),
      maximum_transmission_unit_size: 1316,
      maximum_flow_window_size: 8192,
      ... options
    }
  }

  private relativeTimestamp(): number {
    return (performance.now() - this.base_timestamp) * 1000;
  }

  public start() {
    this.base_timestamp = performance.now();
    this.destination_srt_socket_id = null;
    this.abort();

    this.stat.acknowledgement_number = 1;
    this.stat.rtt = 100 * 1000;
    this.stat.rtt_variance = 50 * 1000;
    this.stat.acknowledgement_buffer = new RingBuffer(1000, UINT31_RANGE);

    this.fullack_interval_id = setInterval(this.onSrtPeriodicFullAckHandler, 10);
    this.keepalive_interval_id = setInterval(this.onSrtPeriodicKeepAliveHandler, 1000);
    this.nak_timeout_id = setTimeout(this.onSrtPeriodicNakHandler, Math.max(20, ((this.stat.rtt + 4 * this.stat.rtt_variance) / 2) / 1000));

    this.recieve_buffer = new RingBuffer(1280, UINT31_RANGE)

    this.emitter.on(EventTypes.SRT_PACKET_RECIEVED, this.onSrtPacketRecievedHandler);
    this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
      event: EventTypes.SRT_PACKET_SEND,
      packet: buildHandshake({
        version: 4,
        encryption_field: 0,
        extension_field: 2,
        initial_packet_sequence_number: 0,
        maximum_transmission_unit_size: this.options.maximum_transmission_unit_size,
        maximum_flow_window_size: this.options.maximum_flow_window_size,
        handshake_type: HandshakeType.INDUCTION,
        srt_socket_id: this.options.socket_id,
        syn_cookie: 0,
        peer_ip_address: new ArrayBuffer(16) // TODO
      }, this.relativeTimestamp(), 0)
    });
    this.handshakeState = HandshakeState.INDUCTIONING;
  }

  public abort() {
    this.handshakeState = HandshakeState.INITIAL;

    this.stat = {
      acknowledgement_number: 1,
      rtt: 100 * 1000,
      rtt_variance: 50 * 1000,
    };
    if (this.fullack_interval_id != null) {
      clearInterval(this.fullack_interval_id);
      this.fullack_interval_id = null;
    }
    if (this.keepalive_interval_id != null) {
      clearInterval(this.keepalive_interval_id);
      this.keepalive_interval_id = null;
    }
    if (this.nak_timeout_id != null) {
      clearTimeout(this.nak_timeout_id);
      this.nak_timeout_id = null;
    }

    this.recieve_buffer = null;

    if (!this.destination_srt_socket_id) { return; }
    this.emitter.off(EventTypes.SRT_PACKET_RECIEVED, this.onSrtPacketRecievedHandler);
    this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
      event: EventTypes.SRT_PACKET_SEND,
      packet: buildShutdown({}, this.relativeTimestamp(), this.destination_srt_socket_id)
    });
    this.destination_srt_socket_id = null;
  }

  private onSrtPacketRecieved({ packet }: Events[typeof EventTypes.SRT_PACKET_RECIEVED]) {
    if (isDataPacket(packet)) {
      if (this.recieve_buffer == null) { return; }
      if (this.handshakeState !== HandshakeState.ESTABLISHED) { return; }
      if (this.destination_srt_socket_id == null) { return; }

      const dataPacket = parseDataPacket(packet);
      const { packet_sequence_number } = dataPacket;

      if (!isFilterPacket(packet)) {
        if (this.recieve_buffer.exseed(packet_sequence_number) >= 2) {
          const to = (packet_sequence_number - 1 + UINT31_RANGE) % UINT31_RANGE;
          const from = (this.recieve_buffer.topSequence()! + 1) % UINT31_RANGE;

          this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
            event: EventTypes.SRT_PACKET_SEND,
            packet: buildNak({
              loss_list: [{
                range: true,
                range_from_sequence_number: from,
                range_to_sequence_number: to,
              }]
            }, this.relativeTimestamp(), this.destination_srt_socket_id)
          });
        }

        this.recieve_buffer.push(dataPacket, packet_sequence_number).forEach((data) => {
          this.emitter.emit(EventTypes.DATA_PACKET_RECIEVED_OR_DROPPED, {
            event: EventTypes.DATA_PACKET_RECIEVED_OR_DROPPED,
            packet: data
          });
        });

        if (this.recieve_buffer.continuitySequence() != null) {
          this.stat.last_acknowledged_packet_sequence_number = (this.recieve_buffer.continuitySequence()! + 1) % UINT31_RANGE;
        }
      } else {
        // pass
      }
    } else if (isControlPacket(packet)) {
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
          const { syn_cookie } = parseHandshake(control);

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
            initial_packet_sequence_number: 0,
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
          }, this.relativeTimestamp(), 0);

          this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
            event: EventTypes.SRT_PACKET_SEND,
            packet: handshake
          });
          this.handshakeState = HandshakeState.CONCLUSIONING;
          break;
        }
        case HandshakeState.CONCLUSIONING: {
          if (control.control_type !== ControlPacketType.HANDSHAKE.ControlType) { return; }

          const { srt_socket_id } = parseHandshake(control);
          this.destination_srt_socket_id = srt_socket_id;

          this.handshakeState = HandshakeState.ESTABLISHED;
          break;
        }
        case HandshakeState.ESTABLISHED: {
          switch(control.control_type) {
            case ControlPacketType.ACKACK.ControlType: {
              const { acknowledgement_number } = parseAckAck(control);
              if (!this.stat.acknowledgement_buffer?.has(acknowledgement_number)) { return; }

              const ack = this.stat.acknowledgement_buffer.get(acknowledgement_number);
              if (!ack) { return; }

              const rtt = this.relativeTimestamp() - ack.timestamp;
              this.stat.rtt = ((7 * this.stat.rtt) + rtt) / 8;
              this.stat.rtt_variance = ((3 * this.stat.rtt_variance) + Math.abs(this.stat.rtt - rtt)) / 4;
              
              break;
            }
          }
          break;
        }
      }
    }
  }

  private onSrtPeriodicKeepAlive() {
    if (this.destination_srt_socket_id == null) { return; }
    if (this.handshakeState !== HandshakeState.ESTABLISHED) { return; }

    this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
      event: EventTypes.SRT_PACKET_SEND,
      packet: buildKeepAlive({}, this.relativeTimestamp(), this.destination_srt_socket_id)
    });
  }

  private onSrtPeriodicFullAck() {
    if (this.destination_srt_socket_id == null) { return; }
    if (this.handshakeState !== HandshakeState.ESTABLISHED) { return; }
    if (this.stat.last_acknowledged_packet_sequence_number == null){ return; }
    if (this.stat.acknowledgement_buffer == null) { return; }

    const ack = {
      acknowledgement_number: this.stat.acknowledgement_number++,
      last_acknowledged_packet_sequence_number: this.stat.last_acknowledged_packet_sequence_number,
      rtt: this.stat.rtt,
      rtt_variance: this.stat.rtt_variance,
      available_buffer_size: 8171, // TODO
      packets_recieving_rate: 200000, // TODO
      estimated_link_capacity: 1000, // TODO
      recieving_rate: 0, // TODO
      timestamp: this.relativeTimestamp()
    };
    this.stat.acknowledgement_buffer.push(ack, ack.acknowledgement_number);

    this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
      event: EventTypes.SRT_PACKET_SEND,
      packet: buildFullAck(ack, ack.timestamp, this.destination_srt_socket_id)
    });
  }

  private onSrtPeriodicNak() {
    const nextNakTime = Math.max(20, ((this.stat.rtt + 4 * this.stat.rtt_variance) / 2) / 1000);
    setTimeout(this.onSrtPeriodicNakHandler, nextNakTime);

    if (this.recieve_buffer == null) { return; }
    if (this.destination_srt_socket_id == null) { return; }
    if (this.handshakeState !== HandshakeState.ESTABLISHED) { return; }

    this.emitter.emit(EventTypes.SRT_PACKET_SEND, {
      event: EventTypes.SRT_PACKET_SEND,
      packet: buildNak({
        loss_list: this.recieve_buffer.gapSequences().map(([from, to]) => {
          if (from === to) {
            return {
              range: false,
              lost_packet_sequence_number: from
            };
          } else {
            return {
              range: true,
              range_from_sequence_number: from,
              range_to_sequence_number: to
            };
          }
        })
      }, this.relativeTimestamp(), this.destination_srt_socket_id)
    });
  }
}
