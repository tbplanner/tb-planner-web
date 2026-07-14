"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import type { PointerEvent as ReactPointerEvent } from "react";

type DrawingTool = "pen" | "eraser" | "select";

type DrawingCanvasProps = {
    isRecording: boolean;
    canPlayRecording: boolean;
    getRecordingElapsedMs: () => number;
    onPlayFromTime: (
        recordingTimeMs: number,
    ) => void;
    currentPlaybackTimeMs: number;
    isAudioPlaying: boolean;
};

type CanvasPoint = {
    x: number;
    y: number;
    pressure: number;
};

type CanvasStroke = {
    id: string;
    tool: DrawingTool;
    pointerType: string;
    color: string;
    baseWidth: number;
    points: CanvasPoint[];
    createdAt: number;
    recordingTimeMs: number | null;
};
type StrokeBounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

type StrokeGroup = {
    id: string;
    strokeIds: string[];
    bounds: StrokeBounds;
    recordingTimeMs: number;
    createdAt: number;
    lastCreatedAt: number;
};

const GROUP_TIME_GAP_MS = 1500;
const GROUP_DISTANCE_PX = 80;
const SELECT_PADDING_PX = 14;

function formatRecordingTime(milliseconds: number) {
    const totalTenths = Math.floor(milliseconds / 100);
    const minutes = Math.floor(totalTenths / 600);
    const seconds = Math.floor((totalTenths % 600) / 10);
    const tenths = totalTenths % 10;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
        2,
        "0",
    )}.${tenths}`;
}
function getStrokeBounds(stroke: CanvasStroke): StrokeBounds {
    const firstPoint = stroke.points[0];

    if (!firstPoint) {
        return {
            minX: 0,
            minY: 0,
            maxX: 0,
            maxY: 0,
        };
    }

    return stroke.points.reduce<StrokeBounds>(
        (bounds, point) => ({
            minX: Math.min(bounds.minX, point.x),
            minY: Math.min(bounds.minY, point.y),
            maxX: Math.max(bounds.maxX, point.x),
            maxY: Math.max(bounds.maxY, point.y),
        }),
        {
            minX: firstPoint.x,
            minY: firstPoint.y,
            maxX: firstPoint.x,
            maxY: firstPoint.y,
        },
    );
}

function mergeBounds(
    firstBounds: StrokeBounds,
    secondBounds: StrokeBounds,
): StrokeBounds {
    return {
        minX: Math.min(firstBounds.minX, secondBounds.minX),
        minY: Math.min(firstBounds.minY, secondBounds.minY),
        maxX: Math.max(firstBounds.maxX, secondBounds.maxX),
        maxY: Math.max(firstBounds.maxY, secondBounds.maxY),
    };
}

function getBoundsDistance(
    firstBounds: StrokeBounds,
    secondBounds: StrokeBounds,
) {
    const horizontalDistance = Math.max(
        firstBounds.minX - secondBounds.maxX,
        secondBounds.minX - firstBounds.maxX,
        0,
    );

    const verticalDistance = Math.max(
        firstBounds.minY - secondBounds.maxY,
        secondBounds.minY - firstBounds.maxY,
        0,
    );

    return Math.hypot(horizontalDistance, verticalDistance);
}

function buildStrokeGroups(
    strokes: CanvasStroke[],
): StrokeGroup[] {
    const groups: StrokeGroup[] = [];

    strokes.forEach((stroke) => {
        if (
            stroke.tool !== "pen" ||
            stroke.recordingTimeMs === null ||
            stroke.points.length === 0
        ) {
            return;
        }

        const bounds = getStrokeBounds(stroke);
        const previousGroup = groups[groups.length - 1];

        const isWithinTime =
            previousGroup !== undefined &&
            stroke.createdAt - previousGroup.lastCreatedAt <=
            GROUP_TIME_GAP_MS;

        const isWithinDistance =
            previousGroup !== undefined &&
            getBoundsDistance(previousGroup.bounds, bounds) <=
            GROUP_DISTANCE_PX;

        if (
            previousGroup &&
            isWithinTime &&
            isWithinDistance
        ) {
            previousGroup.strokeIds.push(stroke.id);
            previousGroup.bounds = mergeBounds(
                previousGroup.bounds,
                bounds,
            );
            previousGroup.lastCreatedAt = stroke.createdAt;
            return;
        }

        groups.push({
            id: `group-${stroke.id}`,
            strokeIds: [stroke.id],
            bounds,
            recordingTimeMs: stroke.recordingTimeMs,
            createdAt: stroke.createdAt,
            lastCreatedAt: stroke.createdAt,
        });
    });

    return groups;
}

function getCanvasPoint(
    event: ReactPointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
): CanvasPoint {
    const rect = canvas.getBoundingClientRect();

    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        pressure:
            event.pointerType === "pen"
                ? Math.max(event.pressure, 0.1)
                : 1,
    };
}

function getStrokeWidth(stroke: CanvasStroke, point: CanvasPoint) {
    if (stroke.tool === "eraser") {
        return stroke.baseWidth;
    }

    return stroke.baseWidth * point.pressure;
}

function prepareContext(
    context: CanvasRenderingContext2D,
    stroke: CanvasStroke,
) {
    context.lineCap = "round";
    context.lineJoin = "round";

    if (stroke.tool === "eraser") {
        context.globalCompositeOperation = "destination-out";
        context.strokeStyle = "rgba(0, 0, 0, 1)";
        context.fillStyle = "rgba(0, 0, 0, 1)";
    } else {
        context.globalCompositeOperation = "source-over";
        context.strokeStyle = stroke.color;
        context.fillStyle = stroke.color;
    }
}

function drawDot(
    context: CanvasRenderingContext2D,
    stroke: CanvasStroke,
    point: CanvasPoint,
) {
    context.save();
    prepareContext(context, stroke);

    const radius = Math.max(getStrokeWidth(stroke, point) / 2, 1);

    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
}

function drawSegment(
    context: CanvasRenderingContext2D,
    stroke: CanvasStroke,
    previousPoint: CanvasPoint,
    currentPoint: CanvasPoint,
) {
    context.save();
    prepareContext(context, stroke);

    context.lineWidth = Math.max(
        getStrokeWidth(stroke, currentPoint),
        1,
    );

    context.beginPath();
    context.moveTo(previousPoint.x, previousPoint.y);
    context.lineTo(currentPoint.x, currentPoint.y);
    context.stroke();
    context.restore();
}

function drawStroke(
    context: CanvasRenderingContext2D,
    stroke: CanvasStroke,
) {
    if (stroke.points.length === 0) {
        return;
    }

    if (stroke.points.length === 1) {
        drawDot(context, stroke, stroke.points[0]);
        return;
    }

    for (let index = 1; index < stroke.points.length; index += 1) {
        drawSegment(
            context,
            stroke,
            stroke.points[index - 1],
            stroke.points[index],
        );
    }
}

export default function DrawingCanvas({
    isRecording,
    canPlayRecording,
    getRecordingElapsedMs,
    onPlayFromTime,
    currentPlaybackTimeMs,
    isAudioPlaying,
}: DrawingCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const currentStrokeRef = useRef<CanvasStroke | null>(null);
    const strokesRef = useRef<CanvasStroke[]>([]);

    const [tool, setTool] = useState<DrawingTool>("pen");
    const [strokeCount, setStrokeCount] = useState(0);
    const [strokeSnapshot, setStrokeSnapshot] = useState<
        CanvasStroke[]
    >([]);

    const [selectedGroupId, setSelectedGroupId] = useState<
        string | null
    >(null);

    const [lastPointerType, setLastPointerType] =
        useState<string>("없음");

    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current;

        if (!canvas) {
            return;
        }

        const context = canvas.getContext("2d");

        if (!context) {
            return;
        }

        context.clearRect(
            0,
            0,
            canvas.clientWidth,
            canvas.clientHeight,
        );

        strokesRef.current.forEach((stroke) => {
            drawStroke(context, stroke);
        });
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;

        if (!canvas) {
            return;
        }

        const resizeCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            const devicePixelRatio = window.devicePixelRatio || 1;

            canvas.width = Math.max(
                1,
                Math.round(rect.width * devicePixelRatio),
            );

            canvas.height = Math.max(
                1,
                Math.round(rect.height * devicePixelRatio),
            );

            const context = canvas.getContext("2d");

            if (!context) {
                return;
            }

            context.setTransform(
                devicePixelRatio,
                0,
                0,
                devicePixelRatio,
                0,
                0,
            );

            redrawCanvas();
        };

        resizeCanvas();

        const resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(canvas);

        return () => {
            resizeObserver.disconnect();
        };
    }, [redrawCanvas]);

    const startDrawing = (
        event: ReactPointerEvent<HTMLCanvasElement>,
    ) => {
        const canvas = canvasRef.current;

        if (!canvas || !event.isPrimary) {
            return;
        }

        event.preventDefault();

        if (tool === "select") {
            setSelectedGroupId(null);
            return;
        }

        canvas.setPointerCapture(event.pointerId);

        const point = getCanvasPoint(event, canvas);

        const newStroke: CanvasStroke = {
            id: crypto.randomUUID(),
            tool,
            pointerType: event.pointerType || "unknown",
            color: "#0f172a",
            baseWidth: tool === "eraser" ? 26 : 4,
            points: [point],
            createdAt: performance.now(),
            recordingTimeMs:
                tool === "pen" && isRecording
                    ? getRecordingElapsedMs()
                    : null,
        };

        drawingRef.current = true;
        currentStrokeRef.current = newStroke;
        setLastPointerType(newStroke.pointerType);

        const context = canvas.getContext("2d");

        if (context) {
            drawDot(context, newStroke, point);
        }
    };

    const continueDrawing = (
        event: ReactPointerEvent<HTMLCanvasElement>,
    ) => {
        const canvas = canvasRef.current;
        const currentStroke = currentStrokeRef.current;

        if (
            !canvas ||
            !drawingRef.current ||
            !currentStroke ||
            !event.isPrimary
        ) {
            return;
        }

        event.preventDefault();

        const currentPoint = getCanvasPoint(event, canvas);
        const previousPoint =
            currentStroke.points[currentStroke.points.length - 1];

        currentStroke.points.push(currentPoint);

        const context = canvas.getContext("2d");

        if (context) {
            drawSegment(
                context,
                currentStroke,
                previousPoint,
                currentPoint,
            );
        }
    };

    const finishDrawing = (
        event: ReactPointerEvent<HTMLCanvasElement>,
    ) => {
        const canvas = canvasRef.current;
        const currentStroke = currentStrokeRef.current;

        if (!canvas || !drawingRef.current || !currentStroke) {
            return;
        }

        event.preventDefault();

        const nextStrokes = [
            ...strokesRef.current,
            currentStroke,
        ];

        strokesRef.current = nextStrokes;
        setStrokeSnapshot(nextStrokes);
        setStrokeCount(nextStrokes.length);

        drawingRef.current = false;
        currentStrokeRef.current = null;

        if (canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }
    };

    const undoLastStroke = () => {
        const nextStrokes = strokesRef.current.slice(0, -1);

        strokesRef.current = nextStrokes;
        setStrokeSnapshot(nextStrokes);
        setStrokeCount(nextStrokes.length);
        setSelectedGroupId(null);
        redrawCanvas();
    };

    const clearCanvas = () => {
        strokesRef.current = [];
        setStrokeSnapshot([]);
        setStrokeCount(0);
        setSelectedGroupId(null);
        redrawCanvas();
    };

    const strokeGroups = useMemo(
        () => buildStrokeGroups(strokeSnapshot),
        [strokeSnapshot],
    );

    const displayedStrokeGroups = useMemo(
        () => [...strokeGroups].reverse(),
        [strokeGroups],
    );

    const activePlaybackGroupId = useMemo(() => {
        if (
            !isAudioPlaying ||
            strokeGroups.length === 0
        ) {
            return null;
        }

        const activeGroup = [...strokeGroups]
            .reverse()
            .find((group) => {
                const highlightStartMs = Math.max(
                    group.recordingTimeMs - 5000,
                    0,
                );

                return (
                    currentPlaybackTimeMs >=
                    highlightStartMs
                );
            });

        return activeGroup?.id ?? null;
    }, [
        currentPlaybackTimeMs,
        isAudioPlaying,
        strokeGroups,
    ]);

    const highlightedGroupId =
        activePlaybackGroupId ?? selectedGroupId;

    const selectStrokeGroup = (group: StrokeGroup) => {
        setSelectedGroupId(group.id);

        if (canPlayRecording) {
            onPlayFromTime(group.recordingTimeMs);
        }
    };

    return (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-semibold">회의 필기판</h2>

                    <p className="mt-1 text-sm text-slate-500">
                        녹음 중 작성한 필기에는 해당 녹음 시각이
                        자동으로 저장됩니다.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setTool("pen")}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold ${tool === "pen"
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-700"
                            }`}
                    >
                        펜
                    </button>

                    <button
                        type="button"
                        onClick={() => setTool("eraser")}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold ${tool === "eraser"
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-700"
                            }`}
                    >
                        지우개
                    </button>

                    <button
                        type="button"
                        onClick={() => setTool("select")}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold ${tool === "select"
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-700"
                            }`}
                    >
                        선택
                    </button>

                    <button
                        type="button"
                        onClick={undoLastStroke}
                        disabled={strokeCount === 0}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        실행 취소
                    </button>

                    <button
                        type="button"
                        onClick={clearCanvas}
                        disabled={strokeCount === 0}
                        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        전체 지우기
                    </button>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500">
                <span>
                    입력 획 수:{" "}
                    <strong className="text-slate-800">{strokeCount}</strong>
                </span>

                <span>
                    필기 문구 수:{" "}
                    <strong className="text-slate-800">
                        {strokeGroups.length}
                    </strong>
                </span>

                <span>
                    마지막 입력기기:{" "}
                    <strong className="text-slate-800">
                        {lastPointerType}
                    </strong>
                </span>

                <span>
                    현재 도구:{" "}
                    <strong className="text-slate-800">
                        {tool === "pen"
                            ? "펜"
                            : tool === "eraser"
                                ? "지우개"
                                : "선택"}
                    </strong>
                </span>

                <span>
                    현재 상태:{" "}
                    <strong
                        className={
                            isRecording ? "text-red-600" : "text-slate-800"
                        }
                    >
                        {isRecording ? "녹음과 필기 연결 중" : "녹음 대기"}
                    </strong>
                </span>
            </div>

            <div className="relative mt-4 overflow-hidden rounded-xl border border-slate-300 bg-white">
                <canvas
                    ref={canvasRef}
                    onPointerDown={startDrawing}
                    onPointerMove={continueDrawing}
                    onPointerUp={finishDrawing}
                    onPointerCancel={finishDrawing}
                    onContextMenu={(event) => event.preventDefault()}
                    className={`block h-[520px] w-full bg-white ${tool === "select"
                        ? "cursor-pointer"
                        : "cursor-crosshair"
                        }`}
                    style={{ touchAction: "none" }}
                    aria-label="회의 필기 영역"
                />

                {strokeGroups.map((group, index) => {
                    const isSelected =
                        highlightedGroupId === group.id;

                    const left = Math.max(
                        group.bounds.minX - SELECT_PADDING_PX,
                        0,
                    );

                    const top = Math.max(
                        group.bounds.minY - SELECT_PADDING_PX,
                        0,
                    );

                    const width = Math.max(
                        group.bounds.maxX -
                        group.bounds.minX +
                        SELECT_PADDING_PX * 2,
                        32,
                    );

                    const height = Math.max(
                        group.bounds.maxY -
                        group.bounds.minY +
                        SELECT_PADDING_PX * 2,
                        32,
                    );

                    return (
                        <button
                            key={group.id}
                            type="button"
                            onClick={() => selectStrokeGroup(group)}
                            className={`absolute z-10 rounded-lg border-2 transition ${tool === "select"
                                    ? ""
                                    : "pointer-events-none"
                                } ${isSelected
                                    ? "border-blue-600 bg-blue-500/20"
                                    : tool === "select"
                                        ? "border-slate-400/70 bg-slate-100/10 hover:border-blue-400 hover:bg-blue-100/30"
                                        : "border-transparent bg-transparent"
                                }`}
                            style={{
                                left,
                                top,
                                width,
                                height,
                            }}
                            aria-label={`필기 문구 ${index + 1} 재생`}
                            title="이 문구의 녹음 위치 재생"
                        />
                    );
                })}
            </div>

            <div className="mt-6 border-t border-slate-200 pt-6">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold">
                            녹음과 연결된 필기
                        </h3>

                        <p className="mt-1 text-sm text-slate-500">
                            각 항목을 누르면 필기한 시점보다 5초 전부터
                            녹음이 재생됩니다.
                        </p>
                    </div>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                        {strokeGroups.length}개
                    </span>
                </div>

                {displayedStrokeGroups.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                        녹음을 시작한 상태에서 필기하면 이곳에 연결
                        문구와 시각이 표시됩니다.
                    </div>
                ) : (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {displayedStrokeGroups.map((group, index) => (
                            <div
                                key={group.id}
                                className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${highlightedGroupId === group.id
                                    ? "border-blue-500 bg-blue-50"
                                    : "border-slate-200"
                                    }`}
                            >
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">
                                        필기 문구{" "}
                                        {displayedStrokeGroups.length - index}
                                    </p>

                                    <p className="mt-1 text-xs text-slate-500">
                                        포함된 획: {group.strokeIds.length}개
                                    </p>

                                    <p className="mt-1 font-mono text-sm text-slate-500">
                                        기록 시각{" "}
                                        {formatRecordingTime(group.recordingTimeMs)}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    disabled={!canPlayRecording}
                                    onClick={() => selectStrokeGroup(group)}
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                    5초 전부터 재생
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <p className="mt-4 text-xs text-slate-500">
                선택 도구를 누르면 문구별 선택 영역이 표시됩니다.
                문구를 직접 누르면 필기한 시점보다 5초 전부터
                녹음이 재생됩니다.
            </p>
        </section>
    );
}