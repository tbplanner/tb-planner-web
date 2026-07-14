export type SavedCanvasPoint = {
    x: number;
    y: number;
    pressure: number;
};

export type SavedCanvasStroke = {
    id: string;
    tool: "pen" | "eraser" | "select";
    pointerType: string;
    color: string;
    baseWidth: number;
    points: SavedCanvasPoint[];
    createdAt: number;
    recordingTimeMs: number | null;
};

export type SavedMeeting = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    durationMs: number;
    audioBlob: Blob | null;
    strokes: SavedCanvasStroke[];
};

const DATABASE_NAME = "tb-planner-database";
const DATABASE_VERSION = 1;
const MEETING_STORE_NAME = "meetings";

function openMeetingDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(
            DATABASE_NAME,
            DATABASE_VERSION,
        );

        request.addEventListener("upgradeneeded", () => {
            const database = request.result;

            if (
                !database.objectStoreNames.contains(
                    MEETING_STORE_NAME,
                )
            ) {
                const meetingStore =
                    database.createObjectStore(
                        MEETING_STORE_NAME,
                        {
                            keyPath: "id",
                        },
                    );

                meetingStore.createIndex(
                    "updatedAt",
                    "updatedAt",
                    {
                        unique: false,
                    },
                );
            }
        });

        request.addEventListener("success", () => {
            resolve(request.result);
        });

        request.addEventListener("error", () => {
            reject(
                request.error ??
                new Error(
                    "TB Planner 데이터베이스를 열지 못했습니다.",
                ),
            );
        });
    });
}

export async function saveMeeting(
    meeting: SavedMeeting,
): Promise<void> {
    const database = await openMeetingDatabase();

    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction(
                MEETING_STORE_NAME,
                "readwrite",
            );

            const meetingStore =
                transaction.objectStore(
                    MEETING_STORE_NAME,
                );

            meetingStore.put(meeting);

            transaction.addEventListener(
                "complete",
                () => {
                    resolve();
                },
            );

            transaction.addEventListener(
                "error",
                () => {
                    reject(
                        transaction.error ??
                        new Error(
                            "회의 기록을 저장하지 못했습니다.",
                        ),
                    );
                },
            );

            transaction.addEventListener(
                "abort",
                () => {
                    reject(
                        transaction.error ??
                        new Error(
                            "회의 기록 저장이 중단됐습니다.",
                        ),
                    );
                },
            );
        });
    } finally {
        database.close();
    }
}

export async function getMeeting(
    meetingId: string,
): Promise<SavedMeeting | null> {
    const database = await openMeetingDatabase();

    try {
        return await new Promise<
            SavedMeeting | null
        >((resolve, reject) => {
            const transaction = database.transaction(
                MEETING_STORE_NAME,
                "readonly",
            );

            const meetingStore =
                transaction.objectStore(
                    MEETING_STORE_NAME,
                );

            const request =
                meetingStore.get(meetingId);

            request.addEventListener("success", () => {
                resolve(
                    (request.result as
                        | SavedMeeting
                        | undefined) ?? null,
                );
            });

            request.addEventListener("error", () => {
                reject(
                    request.error ??
                    new Error(
                        "회의 기록을 불러오지 못했습니다.",
                    ),
                );
            });
        });
    } finally {
        database.close();
    }
}

export async function getAllMeetings(): Promise<
    SavedMeeting[]
> {
    const database = await openMeetingDatabase();

    try {
        const meetings = await new Promise<
            SavedMeeting[]
        >((resolve, reject) => {
            const transaction = database.transaction(
                MEETING_STORE_NAME,
                "readonly",
            );

            const meetingStore =
                transaction.objectStore(
                    MEETING_STORE_NAME,
                );

            const request = meetingStore.getAll();

            request.addEventListener("success", () => {
                resolve(
                    request.result as SavedMeeting[],
                );
            });

            request.addEventListener("error", () => {
                reject(
                    request.error ??
                    new Error(
                        "저장된 회의 목록을 불러오지 못했습니다.",
                    ),
                );
            });
        });

        return meetings.sort(
            (firstMeeting, secondMeeting) =>
                secondMeeting.updatedAt -
                firstMeeting.updatedAt,
        );
    } finally {
        database.close();
    }
}

export async function deleteMeeting(
    meetingId: string,
): Promise<void> {
    const database = await openMeetingDatabase();

    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction(
                MEETING_STORE_NAME,
                "readwrite",
            );

            const meetingStore =
                transaction.objectStore(
                    MEETING_STORE_NAME,
                );

            meetingStore.delete(meetingId);

            transaction.addEventListener(
                "complete",
                () => {
                    resolve();
                },
            );

            transaction.addEventListener(
                "error",
                () => {
                    reject(
                        transaction.error ??
                        new Error(
                            "회의 기록을 삭제하지 못했습니다.",
                        ),
                    );
                },
            );

            transaction.addEventListener(
                "abort",
                () => {
                    reject(
                        transaction.error ??
                        new Error(
                            "회의 기록 삭제가 중단됐습니다.",
                        ),
                    );
                },
            );
        });
    } finally {
        database.close();
    }
}