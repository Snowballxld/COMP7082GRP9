// __tests__/controller.test.js
import { jest } from "@jest/globals";
import request from "supertest";
import express from "express";

// Mock the module AFTER import using jest.unstable_mockModule
jest.unstable_mockModule("child_process", () => ({
    execFile: jest.fn(),
}));

// Re-import mocked version
const { execFile } = await import("child_process");

import { handlePathRequest } from "../controllers/pathfinderController.js";

// Setup express app
const app = express();
app.use(express.json());
app.post("/find-path", handlePathRequest);

describe("Path Request Handler (handlePathRequest)", () => {
    const validPayload = {
        startBuildingCode: "SW03",
        startRoom: "A101",
        goalBuildingCode: "SW05",
        goalRoom: "B202",
    };

    const mockPythonOutput =
        "Path found: [49.251, -123.001], [49.252, -123.002]";

    beforeEach(() => {
        execFile.mockClear();
    });

    test("calls python script with correct arguments", async () => {
        execFile.mockImplementation((cmd, args, opts, cb) => {
            cb(null, mockPythonOutput, "");
        });

        await request(app).post("/find-path").send(validPayload);

        expect(execFile).toHaveBeenCalledTimes(1);
        expect(execFile).toHaveBeenCalledWith(
            "python3",
            [
                expect.any(String),
                "sw", "03", "A101",
                "sw", "05", "B202",
            ],
            expect.any(Object),
            expect.any(Function)
        );
    });

    test("returns 200 with success: true and script output", async () => {
        execFile.mockImplementation((cmd, args, opts, cb) => {
            cb(null, mockPythonOutput, "");
        });

        const res = await request(app).post("/find-path").send(validPayload);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            success: true,
            output: mockPythonOutput,
        });
    });

    test("returns 500 with success: false on exec error", async () => {
        const mockError = new Error("Execution failed");
        const mockStderr = "Python traceback: File not found.";

        execFile.mockImplementation((cmd, args, opts, cb) => {
            cb(mockError, "", mockStderr);
        });

        const res = await request(app).post("/find-path").send(validPayload);

        expect(res.status).toBe(500);
        expect(res.body).toEqual({
            success: false,
            error: mockStderr,
        });
    });

    test("passes undefined for missing body params", async () => {
        const partialPayload = {
            startBuildingCode: "SE12",
            goalBuildingCode: "SE14",
        };

        execFile.mockImplementation((cmd, args, opts, cb) => {
            cb(null, "ok", "");
        });

        await request(app).post("/find-path").send(partialPayload);

        expect(execFile).toHaveBeenCalledTimes(1);

        expect(execFile).toHaveBeenCalledWith(
            expect.any(String),
            [
                expect.any(String),
                "se", "12", undefined,
                "se", "14", undefined,
            ],
            expect.any(Object),
            expect.any(Function)
        );
    });
});
