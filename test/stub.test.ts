import { describe, expect, it } from "vitest";
import { type ListenableServer, listenEphemeral } from "./stub.ts";

/** 假 server：按序吐出给定端口（用尽后重复最后一个），记录 close 次数。 */
function fakeServer(ports: number[]): ListenableServer & { closed: number } {
	let index = 0;
	const fake = {
		closed: 0,
		listen(_port: number, _host: string, onListening: () => void) {
			onListening();
		},
		address() {
			const port = ports[Math.min(index, ports.length - 1)];
			index += 1;
			return { address: "127.0.0.1", family: "IPv4", port };
		},
		close(onClose?: (error?: Error) => void) {
			fake.closed += 1;
			onClose?.();
		},
	};
	return fake;
}

describe("listenEphemeral：绕开 undici 的 bad port 名单（本机动态端口段与名单重叠）", () => {
	it("抽到可用端口时直接返回，不重抽", async () => {
		const server = fakeServer([49152]);

		await expect(listenEphemeral(server)).resolves.toBe(49152);
		expect(server.closed).toBe(0);
	});

	it("抽到 bad port（如 6566）时关掉重抽", async () => {
		const server = fakeServer([6566, 49152]);

		await expect(listenEphemeral(server)).resolves.toBe(49152);
		expect(server.closed).toBe(1);
	});

	it("连续抽到 bad port 时报错，而不是等到用例超时", async () => {
		const server = fakeServer([6566]);

		await expect(listenEphemeral(server)).rejects.toThrow(/拒发的端口/);
		expect(server.closed).toBeGreaterThan(0);
	});
});
