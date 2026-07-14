"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import DrawingCanvas, {
    type CanvasStroke,
} from "./DrawingCanvas";

import {
    deleteMeeting,
    getAllMeetings,
    getMeeting,
    saveMeeting,
    type SavedMeeting,
} from "../../../lib/meetingDb";

type RecordingStatus =
    | "idle"
    | "recording"
    | "stopped";

type SaveStatus =
    | "idle"
    | "saving"
    | "saved"
    | "error";

function formatTime(milliseconds: number) {
    const totalSeconds = Math.floor(
        milliseconds / 1000,
    );

    const minutes = Math.floor(
        totalSeconds / 60,
    );

    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(
        2,
        "0",
    )}:${String(seconds).padStart(2, "0")}`;
}

function formatSavedTime(timestamp: number) {
    return new Intl.DateTimeFormat("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(new Date(timestamp));
}

function formatMeetingDate(timestamp: number) {
    return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(timestamp));
}

export default function MeetingPrototypePage() {
    const [status, setStatus] =
        useState<RecordingStatus>("idle");

    const [elapsedMs, setElapsedMs] =
        useState(0);

    const [audioUrl, setAudioUrl] =
        useState<string | null>(null);

    const [audioBlob, setAudioBlob] =
        useState<Blob | null>(null);

    const [errorMessage, setErrorMessage] =
        useState("");

    const [playbackTimeMs, setPlaybackTimeMs] =
        useState(0);

    const [isAudioPlaying, setIsAudioPlaying] =
        useState(false);

    const [meetingTitle, setMeetingTitle] =
        useState("새 회의 기록");

    const [meetingStrokes, setMeetingStrokes] =
        useState<CanvasStroke[]>([]);

    const [saveStatus, setSaveStatus] =
        useState<SaveStatus>("idle");

    const [savedAt, setSavedAt] =
        useState<number | null>(null);

    const [savedMeetings, setSavedMeetings] =
        useState<SavedMeeting[]>([]);

    const [
        isMeetingListLoading,
        setIsMeetingListLoading,
    ] = useState(true);

    const [meetingActionId, setMeetingActionId] =
        useState<string | null>(null);

    const audioRef =
        useRef<HTMLAudioElement | null>(null);

    const mediaRecorderRef =
        useRef<MediaRecorder | null>(null);

    const streamRef =
        useRef<MediaStream | null>(null);

    const audioChunksRef = useRef<Blob[]>([]);

    const timerRef =
        useRef<number | null>(null);

    const recordingStartedAtRef =
        useRef<number | null>(null);

    const meetingIdRef =
        useRef<string | null>(null);

    const meetingCreatedAtRef =
        useRef<number | null>(null);

    const refreshSavedMeetings =
        useCallback(async () => {
            try {
                setIsMeetingListLoading(true);

                const meetings =
                    await getAllMeetings();

                setSavedMeetings(meetings);
            } catch (error) {
                console.error(error);

                setErrorMessage(
                    "저장된 회의 목록을 불러오지 못했습니다.",
                );
            } finally {
                setIsMeetingListLoading(false);
            }
        }, []);

    const clearRecordingTimer = () => {
        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const closeMicrophone = () => {
        streamRef.current
            ?.getTracks()
            .forEach((track) => track.stop());

        streamRef.current = null;
    };

    const startRecording = async () => {
        setErrorMessage("");
        setPlaybackTimeMs(0);
        setIsAudioPlaying(false);
        setAudioBlob(null);
        setSaveStatus("idle");
        setSavedAt(null);

        if (!navigator.mediaDevices?.getUserMedia) {
            setErrorMessage(
                "현재 브라우저에서는 마이크 녹음을 지원하지 않습니다.",
            );
            return;
        }

        if (!window.MediaRecorder) {
            setErrorMessage(
                "현재 브라우저에서는 녹음 기능을 지원하지 않습니다.",
            );
            return;
        }

        try {
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
                setAudioUrl(null);
            }

            const stream =
                await navigator.mediaDevices.getUserMedia({
                    audio: true,
                });

            streamRef.current = stream;
            audioChunksRef.current = [];

            const recorder =
                new MediaRecorder(stream);

            mediaRecorderRef.current = recorder;

            recorder.addEventListener(
                "dataavailable",
                (event) => {
                    if (event.data.size > 0) {
                        audioChunksRef.current.push(
                            event.data,
                        );
                    }
                },
            );

            recorder.addEventListener("stop", () => {
                const recordedAudioBlob = new Blob(
                    audioChunksRef.current,
                    {
                        type:
                            recorder.mimeType ||
                            "audio/webm",
                    },
                );

                const newAudioUrl =
                    URL.createObjectURL(
                        recordedAudioBlob,
                    );

                setAudioUrl((previousUrl) => {
                    if (previousUrl) {
                        URL.revokeObjectURL(
                            previousUrl,
                        );
                    }

                    return newAudioUrl;
                });

                setAudioBlob(recordedAudioBlob);
                setPlaybackTimeMs(0);
                setIsAudioPlaying(false);
                setSaveStatus("idle");
                setSavedAt(null);
                setStatus("stopped");

                clearRecordingTimer();
                closeMicrophone();
            });

            recorder.addEventListener(
                "error",
                () => {
                    setErrorMessage(
                        "녹음 중 오류가 발생했습니다.",
                    );

                    setStatus("idle");
                    setIsAudioPlaying(false);

                    clearRecordingTimer();
                    closeMicrophone();
                },
            );

            recordingStartedAtRef.current =
                Date.now();

            setElapsedMs(0);
            setStatus("recording");

            recorder.start(1000);

            timerRef.current =
                window.setInterval(() => {
                    if (
                        recordingStartedAtRef.current !==
                        null
                    ) {
                        setElapsedMs(
                            Date.now() -
                            recordingStartedAtRef.current,
                        );
                    }
                }, 250);
        } catch (error) {
            console.error(error);

            setStatus("idle");
            setIsAudioPlaying(false);

            clearRecordingTimer();
            closeMicrophone();

            if (
                error instanceof DOMException &&
                error.name === "NotAllowedError"
            ) {
                setErrorMessage(
                    "마이크 사용이 허용되지 않았습니다. 브라우저의 마이크 권한을 허용해주세요.",
                );
                return;
            }

            setErrorMessage(
                "마이크를 시작할 수 없습니다. 마이크 연결과 브라우저 권한을 확인해주세요.",
            );
        }
    };

    const stopRecording = () => {
        const recorder =
            mediaRecorderRef.current;

        if (
            !recorder ||
            recorder.state === "inactive"
        ) {
            return;
        }

        if (
            recordingStartedAtRef.current !== null
        ) {
            setElapsedMs(
                Date.now() -
                recordingStartedAtRef.current,
            );
        }

        recorder.stop();
        recordingStartedAtRef.current = null;
    };

    const getCurrentRecordingElapsedMs = () => {
        if (
            status === "recording" &&
            recordingStartedAtRef.current !== null
        ) {
            return (
                Date.now() -
                recordingStartedAtRef.current
            );
        }

        return elapsedMs;
    };

    const playFromRecordingTime = async (
        recordingTimeMs: number,
    ) => {
        const audio = audioRef.current;

        if (!audio || !audioUrl) {
            setErrorMessage(
                "먼저 녹음을 종료한 뒤 연결된 필기를 재생해주세요.",
            );
            return;
        }

        const targetSeconds = Math.max(
            0,
            recordingTimeMs / 1000 - 5,
        );

        if (Number.isFinite(audio.duration)) {
            audio.currentTime = Math.min(
                targetSeconds,
                Math.max(
                    audio.duration - 0.05,
                    0,
                ),
            );
        } else {
            audio.currentTime = targetSeconds;
        }

        setPlaybackTimeMs(
            audio.currentTime * 1000,
        );

        try {
            setErrorMessage("");
            await audio.play();
        } catch (error) {
            console.error(error);

            setErrorMessage(
                "연결된 녹음을 재생하지 못했습니다. 재생 버튼을 다시 눌러주세요.",
            );
        }
    };

    const handleStrokesChange = (
        nextStrokes: CanvasStroke[],
    ) => {
        setMeetingStrokes([...nextStrokes]);
        setSaveStatus("idle");
        setSavedAt(null);
    };

    const handleSaveMeeting = async (
        now: number,
    ) => {
        if (status === "recording") {
            setErrorMessage(
                "녹음을 종료한 뒤 회의 기록을 저장해주세요.",
            );
            return;
        }

        if (
            !audioBlob &&
            meetingStrokes.length === 0
        ) {
            setErrorMessage(
                "저장할 녹음이나 필기 내용이 없습니다.",
            );
            return;
        }


        const meetingId =
            meetingIdRef.current ??
            crypto.randomUUID();

        const createdAt =
            meetingCreatedAtRef.current ?? now;

        meetingIdRef.current = meetingId;
        meetingCreatedAtRef.current = createdAt;

        const normalizedTitle =
            meetingTitle.trim() ||
            "제목 없는 회의";

        try {
            setErrorMessage("");
            setSaveStatus("saving");

            await saveMeeting({
                id: meetingId,
                title: normalizedTitle,
                createdAt,
                updatedAt: now,
                durationMs: elapsedMs,
                audioBlob,
                strokes: meetingStrokes,
            });

            setMeetingTitle(normalizedTitle);
            setSaveStatus("saved");
            setSavedAt(now);

            await refreshSavedMeetings();
        } catch (error) {
            console.error(error);

            setSaveStatus("error");

            setErrorMessage(
                "회의 기록을 저장하지 못했습니다. 브라우저 저장공간을 확인해주세요.",
            );
        }
    };

    const handleStartNewMeeting = () => {
        audioRef.current?.pause();

        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
        }

        setMeetingTitle("새 회의 기록");
        setMeetingStrokes([]);
        setAudioBlob(null);
        setAudioUrl(null);
        setElapsedMs(0);
        setPlaybackTimeMs(0);
        setIsAudioPlaying(false);
        setStatus("idle");
        setSaveStatus("idle");
        setSavedAt(null);
        setErrorMessage("");

        meetingIdRef.current = null;
        meetingCreatedAtRef.current = null;
    };

    const handleLoadMeeting = async (
        meetingId: string,
    ) => {
        try {
            setMeetingActionId(meetingId);
            setErrorMessage("");

            const meeting =
                await getMeeting(meetingId);

            if (!meeting) {
                setErrorMessage(
                    "선택한 회의 기록을 찾지 못했습니다.",
                );
                return;
            }

            audioRef.current?.pause();

            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }

            const loadedAudioUrl =
                meeting.audioBlob
                    ? URL.createObjectURL(
                        meeting.audioBlob,
                    )
                    : null;

            setMeetingTitle(meeting.title);

            setMeetingStrokes(
                meeting.strokes.map((stroke) => ({
                    ...stroke,
                    points: stroke.points.map(
                        (point) => ({
                            ...point,
                        }),
                    ),
                })),
            );

            setAudioBlob(meeting.audioBlob);
            setAudioUrl(loadedAudioUrl);
            setElapsedMs(meeting.durationMs);
            setPlaybackTimeMs(0);
            setIsAudioPlaying(false);

            setStatus(
                meeting.audioBlob
                    ? "stopped"
                    : "idle",
            );

            setSaveStatus("saved");
            setSavedAt(meeting.updatedAt);

            meetingIdRef.current = meeting.id;
            meetingCreatedAtRef.current =
                meeting.createdAt;
        } catch (error) {
            console.error(error);

            setErrorMessage(
                "회의 기록을 불러오지 못했습니다.",
            );
        } finally {
            setMeetingActionId(null);
        }
    };

    const handleDeleteMeeting = async (
        meeting: SavedMeeting,
    ) => {
        const shouldDelete = window.confirm(
            `"${meeting.title}" 회의 기록을 삭제할까요?`,
        );

        if (!shouldDelete) {
            return;
        }

        try {
            setMeetingActionId(meeting.id);
            setErrorMessage("");

            await deleteMeeting(meeting.id);

            if (
                meetingIdRef.current === meeting.id
            ) {
                handleStartNewMeeting();
            }

            await refreshSavedMeetings();
        } catch (error) {
            console.error(error);

            setErrorMessage(
                "회의 기록을 삭제하지 못했습니다.",
            );
        } finally {
            setMeetingActionId(null);
        }
    };

    useEffect(() => {
        const animationFrameId =
            window.requestAnimationFrame(() => {
                void refreshSavedMeetings();
            });

        return () => {
            window.cancelAnimationFrame(
                animationFrameId,
            );
        };
    }, [refreshSavedMeetings]);

    useEffect(() => {
        return () => {
            clearRecordingTimer();

            const recorder =
                mediaRecorderRef.current;

            if (
                recorder &&
                recorder.state !== "inactive"
            ) {
                recorder.stop();
            }

            closeMicrophone();

            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [audioUrl]);

    return (
        <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
            <div className="mx-auto max-w-6xl">
                <header className="mb-6">
                    <p className="text-sm font-semibold tracking-wider text-slate-500">
                        TB PLANNER
                    </p>

                    <h1 className="mt-2 text-3xl font-bold">
                        회의 녹음·필기 시험실
                    </h1>

                    <p className="mt-2 text-slate-600">
                        회의 녹음과 필기 시점을 연결하고
                        저장하기 위한 기술검증 페이지입니다.
                    </p>
                </header>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-6 grid gap-3 md:grid-cols-[1fr_auto]">
                        <label className="block">
                            <span className="text-sm font-semibold text-slate-600">
                                회의 제목
                            </span>

                            <input
                                type="text"
                                value={meetingTitle}
                                onChange={(event) => {
                                    setMeetingTitle(
                                        event.target.value,
                                    );

                                    setSaveStatus("idle");
                                    setSavedAt(null);
                                }}
                                placeholder="회의 제목을 입력하세요"
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>

                        <div className="flex items-end">
                            <button
                                type="button"
                                onClick={(event) => {
                                    void handleSaveMeeting(
                                        performance.timeOrigin +
                                        event.timeStamp,
                                    );
                                }}
                                disabled={
                                    status === "recording" ||
                                    saveStatus === "saving"
                                }
                                className="w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 md:w-auto"
                            >
                                {saveStatus === "saving"
                                    ? "저장 중..."
                                    : "회의 기록 저장"}
                            </button>
                        </div>
                    </div>

                    <div
                        className="mb-6 min-h-6 text-sm"
                        aria-live="polite"
                    >
                        {saveStatus === "saved" &&
                            savedAt !== null && (
                                <p className="font-semibold text-green-700">
                                    저장 완료 ·{" "}
                                    {formatSavedTime(savedAt)}
                                </p>
                            )}

                        {saveStatus === "error" && (
                            <p className="font-semibold text-red-700">
                                저장에 실패했습니다.
                            </p>
                        )}

                        {saveStatus === "idle" && (
                            <p className="text-slate-500">
                                저장 버튼을 누르면 현재 녹음과
                                필기가 이 브라우저에 보관됩니다.
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-slate-500">
                                녹음 경과시간
                            </p>

                            <p className="mt-2 font-mono text-5xl font-bold tracking-wider">
                                {formatTime(elapsedMs)}
                            </p>

                            <div className="mt-3 flex items-center gap-2">
                                <span
                                    className={`h-3 w-3 rounded-full ${status === "recording"
                                        ? "animate-pulse bg-red-500"
                                        : "bg-slate-300"
                                        }`}
                                />

                                <span className="text-sm font-medium text-slate-600">
                                    {status === "recording"
                                        ? "녹음 중"
                                        : status === "stopped"
                                            ? "녹음 완료"
                                            : "녹음 대기"}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={startRecording}
                                disabled={
                                    status === "recording"
                                }
                                className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                녹음 시작
                            </button>

                            <button
                                type="button"
                                onClick={stopRecording}
                                disabled={
                                    status !== "recording"
                                }
                                className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                녹음 종료
                            </button>
                        </div>
                    </div>

                    {errorMessage && (
                        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                            {errorMessage}
                        </div>
                    )}

                    {audioUrl && (
                        <div className="mt-6 border-t border-slate-200 pt-6">
                            <h2 className="text-lg font-semibold">
                                녹음 결과
                            </h2>

                            <p className="mt-1 text-sm text-slate-500">
                                녹음한 내용을 아래에서 재생해
                                확인합니다.
                            </p>

                            <audio
                                ref={audioRef}
                                className="mt-4 w-full"
                                controls
                                src={audioUrl}
                                onLoadedMetadata={() => {
                                    setPlaybackTimeMs(0);
                                }}
                                onTimeUpdate={(event) => {
                                    setPlaybackTimeMs(
                                        event.currentTarget
                                            .currentTime * 1000,
                                    );
                                }}
                                onSeeked={(event) => {
                                    setPlaybackTimeMs(
                                        event.currentTarget
                                            .currentTime * 1000,
                                    );
                                }}
                                onPlay={() => {
                                    setIsAudioPlaying(true);
                                }}
                                onPause={() => {
                                    setIsAudioPlaying(false);
                                }}
                                onEnded={() => {
                                    setIsAudioPlaying(false);
                                }}
                            >
                                현재 브라우저에서는 오디오
                                재생을 지원하지 않습니다.
                            </audio>
                        </div>
                    )}
                </section>

                <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-xl font-semibold">
                                저장된 회의
                            </h2>

                            <p className="mt-1 text-sm text-slate-500">
                                저장한 녹음과 필기를 다시
                                불러올 수 있습니다.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={handleStartNewMeeting}
                            disabled={status === "recording"}
                            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            새 회의 시작
                        </button>
                    </div>

                    {isMeetingListLoading ? (
                        <div className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                            저장된 회의를 불러오는 중입니다.
                        </div>
                    ) : savedMeetings.length === 0 ? (
                        <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                            아직 저장된 회의가 없습니다.
                        </div>
                    ) : (
                        <div className="mt-5 grid gap-3 md:grid-cols-2">
                            {savedMeetings.map((meeting) => (
                                <article
                                    key={meeting.id}
                                    className="rounded-xl border border-slate-200 p-4"
                                >
                                    <h3 className="font-semibold text-slate-900">
                                        {meeting.title}
                                    </h3>

                                    <p className="mt-1 text-xs text-slate-500">
                                        {formatMeetingDate(
                                            meeting.updatedAt,
                                        )}
                                    </p>

                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                                        <span className="rounded-full bg-slate-100 px-3 py-1">
                                            녹음{" "}
                                            {formatTime(
                                                meeting.durationMs,
                                            )}
                                        </span>

                                        <span className="rounded-full bg-slate-100 px-3 py-1">
                                            필기 {meeting.strokes.length}획
                                        </span>

                                        <span className="rounded-full bg-slate-100 px-3 py-1">
                                            {meeting.audioBlob
                                                ? "녹음 있음"
                                                : "녹음 없음"}
                                        </span>
                                    </div>

                                    <div className="mt-4 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleLoadMeeting(
                                                    meeting.id,
                                                )
                                            }
                                            disabled={
                                                meetingActionId !== null ||
                                                status === "recording"
                                            }
                                            className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                                        >
                                            {meetingActionId === meeting.id
                                                ? "처리 중..."
                                                : "불러오기"}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleDeleteMeeting(meeting)
                                            }
                                            disabled={
                                                meetingActionId !== null ||
                                                status === "recording"
                                            }
                                            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            삭제
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>

                <DrawingCanvas
                    isRecording={status === "recording"}
                    canPlayRecording={Boolean(audioUrl)}
                    getRecordingElapsedMs={
                        getCurrentRecordingElapsedMs
                    }
                    onPlayFromTime={
                        playFromRecordingTime
                    }
                    currentPlaybackTimeMs={
                        playbackTimeMs
                    }
                    isAudioPlaying={isAudioPlaying}
                    strokes={meetingStrokes}
                    onStrokesChange={
                        handleStrokesChange
                    }
                />
            </div>
        </main>
    );
}