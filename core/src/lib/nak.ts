import { buildControlPacket, ControlPacket, ControlPacketType } from "./control-packet";

export type Loss = {
  range: false,
  lost_packet_sequence_number: number
} | {
  range: true,
  range_from_sequence_number: number,
  range_to_sequence_number: number
};

export type Nak = {
  loss_list: Loss[]
};

export const parseNak = ({ CIF }: ControlPacket): Nak => {
  const view = new DataView(CIF);
  const loss_list: Loss[] = [];
  for (let i = 0; i < CIF.byteLength; ) {
    const range = (view.getUint8(i + 0) & 0x8000) !== 0;
    if (range) {
      loss_list.push({
        range,
        range_from_sequence_number: (view.getUint32(i + 0, false) & 0x7FFFFFFF),
        range_to_sequence_number: (view.getUint32(i + 4, false) & 0x7FFFFFFF)
      });
      i += 8;
    } else {
      loss_list.push({
        range,
        lost_packet_sequence_number: (view.getUint32(i + 0, false) & 0x7FFFFFFF)
      });
      i += 4;
    }
  }

  return {
    loss_list
  }
};

export const buildNak = (nak: Nak, timestamp: number, destination_socket_id: number): ArrayBuffer => {
  let length = 0;
  for (const { range } of nak.loss_list) {
    length += range ? 8 : 4;
  }
  const CIF = new ArrayBuffer(length);
  const view = new DataView(CIF);

  for (let position = 0, index = 0; position < CIF.byteLength; index++) {
    const loss = nak.loss_list[index];
    if (loss.range) {
      view.setUint32(position + 0, loss.range_from_sequence_number | 0x80000000, false);
      view.setUint32(position + 4, loss.range_to_sequence_number & 0x7FFFFFFF, false);
      position += 8;
    } else {
      view.setUint32(position + 0, loss.lost_packet_sequence_number & 0x7FFFFFFF, false);
      position += 4;
    }
  }

  return buildControlPacket({
    F: 1,
    control_type: ControlPacketType.NAK.ControlType,
    sub_type: ControlPacketType.NAK.Subtype,
    type_specific_information: new ArrayBuffer(4),
    timestamp: timestamp,
    destination_socket_id: destination_socket_id,
    CIF
  });
}
