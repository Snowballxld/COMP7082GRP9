import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const showHome = (req, res) => {
    res.render("mapselect");
};

export const handlePathRequest = (req, res) => {
    const { start, goal } = req.body;
    const scriptPath = path.join(__dirname, "../pathFinding.py");

    execFile("python3", [scriptPath, start, goal], { cwd: path.join(__dirname, "../") }, (err, stdout, stderr) => {
        if (err) {
            console.error(stderr);
            return res.render("result", { output: `Error running pathfinder: ${stderr}`, showImages: false });
        }

        res.render("result", {
            output: stdout,
            showImages: true,
            page: 'result',
            title: 'Building Map Navigator – Path Result'
        });
    });
};
