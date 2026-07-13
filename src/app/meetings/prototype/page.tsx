"use client";

import { useEffect, useRef, useState } from "react";
import DrawingCanvas from "./DrawingCanvas";

type RecordingStatus = "idle" | "recording" | "stopped";

function formatTime(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}`;
}

export default function MeetingPrototypePage() {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);

  const clearRecordingTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const closeMicrophone = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    setErrorMessage("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("현재 브라우저에서는 마이크 녹음을 지원하지 않습니다.");
      return;
    }

    if (!window.MediaRecorder) {
      setErrorMessage("현재 브라우저에서는 녹음 기능을 지원하지 않습니다.");
      return;
    }

    try {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        const newAudioUrl = URL.createObjectURL(audioBlob);

        setAudioUrl((previousUrl) => {
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl);
          }

          return newAudioUrl;
        });

        setStatus("stopped");
        clearRecordingTimer();
        closeMicrophone();
      });

      recorder.addEventListener("error", () => {
        setErrorMessage("녹음 중 오류가 발생했습니다.");
        setStatus("idle");
        clearRecordingTimer();
        closeMicrophone();
      });

      recordingStartedAtRef.current = Date.now();
      setElapsedMs(0);
      setStatus("recording");

      recorder.start(1000);

      timerRef.current = window.setInterval(() => {
        if (recordingStartedAtRef.current !== null) {
          setElapsedMs(Date.now() - recordingStartedAtRef.current);
        }
      }, 250);
    } catch (error) {
      console.error(error);

      setStatus("idle");
      clearRecordingTimer();
      closeMicrophone();

      if (error instanceof DOMException && error.name === "NotAllowedError") {
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
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      return;
    }

    if (recordingStartedAtRef.current !== null) {
      setElapsedMs(Date.now() - recordingStartedAtRef.current);
    }

    recorder.stop();
    recordingStartedAtRef.current = null;
  };
const getCurrentRecordingElapsedMs = () => {
  if (
    status === "recording" &&
    recordingStartedAtRef.current !== null
  ) {
    return Date.now() - recordingStartedAtRef.current;
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
      Math.max(audio.duration - 0.05, 0),
    );
  } else {
    audio.currentTime = targetSeconds;
  }

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
  useEffect(() => {
    return () => {
      clearRecordingTimer();

      const recorder = mediaRecorderRef.current;

      if (recorder && recorder.state !== "inactive") {
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
            회의 녹음과 필기 시점을 연결하기 위한 기술검증 페이지입니다.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
                  className={`h-3 w-3 rounded-full ${
                    status === "recording"
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
                disabled={status === "recording"}
                className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                녹음 시작
              </button>

              <button
                type="button"
                onClick={stopRecording}
                disabled={status !== "recording"}
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
              <h2 className="text-lg font-semibold">녹음 결과</h2>

              <p className="mt-1 text-sm text-slate-500">
                녹음한 내용을 아래에서 재생해 확인합니다.
              </p>

              <audio
                ref={audioRef}
                className="mt-4 w-full"
                controls
                src={audioUrl}
              >
                현재 브라우저에서는 오디오 재생을 지원하지 않습니다.
              </audio>
            </div>
          )}
        </section>

        <DrawingCanvas
          isRecording={status === "recording"}
          canPlayRecording={Boolean(audioUrl)}
          getRecordingElapsedMs={getCurrentRecordingElapsedMs}
          onPlayFromTime={playFromRecordingTime}
        />
      </div>
    </main>
  );
}