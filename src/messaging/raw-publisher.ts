import { connect } from "amqplib";
import type { RawSourceEvent } from "../types";

export class RawPublisher {
  constructor(
    private readonly rabbitmqUrl: string,
    private readonly queueName: string
  ) {}

  async publish(event: RawSourceEvent): Promise<void> {
    const connection = await connect(this.rabbitmqUrl);
    const channel = await connection.createChannel();

    try {
      await channel.assertQueue(this.queueName, { durable: true });
      channel.sendToQueue(this.queueName, Buffer.from(JSON.stringify(event)), {
        contentType: "application/json",
        persistent: true
      });
    } finally {
      await channel.close();
      await connection.close();
    }
  }
}
