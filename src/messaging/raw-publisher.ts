import { connect, type Channel, type ChannelModel } from "amqplib";
import type { RawSourceEvent } from "../types";

export class RawPublisher {
  private connection?: ChannelModel;
  private channel?: Channel;

  constructor(
    private readonly rabbitmqUrl: string,
    private readonly queueName: string
  ) {}

  async init(additionalQueues: string[] = []): Promise<void> {
    this.connection = await connect(this.rabbitmqUrl);
    this.channel = await this.connection.createChannel();
    const channel = this.getChannel();

    await channel.assertQueue(this.queueName, { durable: true });
    await Promise.all(
      additionalQueues.map((queueName) => channel.assertQueue(queueName, { durable: true }))
    );
  }

  async publish(event: RawSourceEvent): Promise<void> {
    this.publishJson(this.queueName, event);
  }

  async publishTo(queueName: string, payload: unknown): Promise<void> {
    const channel = this.getChannel();

    await channel.assertQueue(queueName, { durable: true });
    this.publishJson(queueName, payload);
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  private getChannel(): Channel {
    if (!this.channel) {
      throw new Error("RawPublisher is not initialized");
    }

    return this.channel;
  }

  private publishJson(queueName: string, payload: unknown) {
    this.getChannel().sendToQueue(queueName, Buffer.from(JSON.stringify(payload)), {
      contentType: "application/json",
      persistent: true
    });
  }
}
