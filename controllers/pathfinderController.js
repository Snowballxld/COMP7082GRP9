import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const handlePathRequest = (req, res) => {
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


    execFile("python3", [scriptPath, ...scriptArgs], { cwd: path.join(__dirname, "../") }, (err, stdout, stderr) => {
        if (err) {
            console.error(stderr);
            const errorOutput = `Error running pathfinder: ${stderr}\nExecuted: python3 ${scriptPath} ${scriptArgs.join(' ')}`;
            return res.render("result", { output: errorOutput, showImages: false, title: 'Building Map Navigator – Error' });
        }

        res.render("result", {
            output: stdout,
            showImages: true,
            page: 'result',
            title: 'Building Map Navigator – Path Result'
        });
    });
};