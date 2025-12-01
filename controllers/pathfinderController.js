import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const handlePathRequest = (req, res) => {
    console.log("REQ BODY:", req.body);
    const { startBuildingCode, startRoom, goalBuildingCode, goalRoom } = req.body;

    const startDirection = startBuildingCode.slice(0, 2).toLowerCase();
    const startNumber = startBuildingCode.slice(2);

    const goalDirection = goalBuildingCode.slice(0, 2).toLowerCase();
    const goalNumber = goalBuildingCode.slice(2);
    const scriptPath = path.join(__dirname, "/pathFindingRoom.py");

    const scriptArgs = [
        startDirection,
        startNumber,
        startRoom,
        goalDirection,
        goalNumber,
        goalRoom
    ];

    console.log("Running python script…");

    execFile("python3", [scriptPath, ...scriptArgs], { cwd: path.join(__dirname, "../") }, (err, stdout, stderr) => {
        if (err) {
            console.error(stderr);
            return res.status(500).json({
                success: false,
                error: stderr
            });
        }

        console.log("Worked2");

        res.json({
            success: true,
            output: stdout
        });
    });
};