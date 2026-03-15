document.addEventListener('DOMContentLoaded', function () {
    // 1. 時間入力 (flatpickr) の設定
    const timeConfig = { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, minuteIncrement: 15, allowInput: false };
    const startTimePicker = flatpickr("#event-start-time", { ...timeConfig, onChange: (s, t) => endTimePicker.set('minTime', t) });
    const endTimePicker = flatpickr("#event-end-time", { ...timeConfig });

    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return; 

    let localEvents = JSON.parse(localStorage.getItem("events")) || [];
    
    // HTMLのdata属性から管理者イベントデータを取得
    const adminEventsEl = document.getElementById('admin-events-data');
    const adminEventsData = adminEventsEl ? JSON.parse(adminEventsEl.dataset.events || "[]") : [];
    const modal = document.getElementById("event-modal");
    let editingEventId = null;

    // ★ 修正点1: 現在の画面モード（月・週・日）を安全に記録する変数
    let currentViewType = 'dayGridMonth';

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: currentViewType,
        locale: 'ja',
        height: 'auto',
        headerToolbar: { 
            left: 'prev,next today', center: 'title', 
            right: 'addEventButton dayGridMonth,timeGridWeek,timeGridDay' 
        },
        customButtons: { addEventButton: { text: '＋ 予定を追加', click: () => openModalForAdd() } },
        
        // ★ 修正点2: 月⇔週モードを切り替えた瞬間に、予定を「正しい形」で再描画させる
        datesSet: function(info) {
            if (info.view.type !== currentViewType) {
                currentViewType = info.view.type;
                calendar.refetchEvents();
            }
        },
        
        // --- データの読み込みロジック ---
        events: async function(info, successCallback, failureCallback) {
            let safeLocalEvents = localEvents.map((e, idx) => {
                if (!e.date || e.date.trim() === "") return null;
                // もしIDがなければ、この場で一時的なIDを振る（一時的だが、削除・更新のフックにはなる）
                if (!e.id) e.id = "temp_" + idx; 

                const hasTime = e.startTime && e.startTime.includes(':');
                const startISO = hasTime ? `${e.date}T${e.startTime}:00` : e.date;
                const endISO = (hasTime && e.endTime) ? `${e.date}T${e.endTime}:00` : null;
                return {
                    id: String(e.id), title: e.title, start: startISO, end: endISO, allDay: !hasTime, color: e.color,
                    extendedProps: { description: e.description, startTime: e.startTime, endTime: e.endTime, isLocal: true, originalId: e.id }
                };
            }).filter(e => e !== null);

            let allEvents = safeLocalEvents.concat(adminEventsData);

            try {
                const response = await fetch('/api/calendar_data');
                if (!response.ok) throw new Error(`API通信エラー: ${response.status}`);
                const data = await response.json();

                // 変数を使って「今は月表示か？」を安全に判定（クラッシュ対策済み！）
                const isMonthView = (currentViewType === 'dayGridMonth');

                let checkDate = new Date(info.start);
                const endDate = new Date(info.end);

                while (checkDate <= endDate) {
                    const dateStr = checkDate.toLocaleDateString('sv-SE');
                    const dayKey = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' }[checkDate.getDay()];

                    if (dayKey) {
                        const currentTerm = data.periods.find(p => dateStr >= p.start && dateStr <= p.end);

                        if (currentTerm) {
                            const todayCourses = data.courses
                                .filter(c => c.term === currentTerm.term && c.day === dayKey)
                                .sort((a, b) => a.period - b.period);

                            if (todayCourses.length > 0) {
                                if (isMonthView) {
                                    // 【月表示】まとめたイベントを作る
                                    const detailsText = todayCourses.map(c => {
                                        const t = data.period_times[c.period] || {start: '未設定', end: '未設定'};
                                        return `${c.period}限 (${t.start}〜${t.end}) : ${c.name}`;
                                    }).join('\n');

                                    allEvents.push({
                                        title: `📖 授業 ${todayCourses.length}件`, start: dateStr, allDay: true, color: '#64748b',
                                        extendedProps: { isCourseSummary: true, details: detailsText }
                                    });
                                } else {
                                    // 【週・日表示】時限の時間を読み取って、カレンダーの「時間枠」に配置する
                                    todayCourses.forEach(c => {
                                        const time = data.period_times[c.period];
                                        if (time && time.start && time.start.includes(':')) {
                                            allEvents.push({
                                                title: `${c.period}限: ${c.name}`, 
                                                start: `${dateStr}T${time.start}:00`, 
                                                end: `${dateStr}T${time.end}:00`,
                                                allDay: false, // ★これで終日表示ではなく、時間枠に入ります！
                                                color: '#e2e8f0', textColor: '#475569', borderColor: '#cbd5e1',
                                                extendedProps: { isCourseDetail: true, period: c.period, startTime: time.start, endTime: time.end }
                                            });
                                        } else {
                                            // 時間設定がない場合は終日枠に置く
                                            allEvents.push({
                                                title: `${c.period}限: ${c.name} (時間未定)`, start: dateStr, allDay: true,
                                                color: '#f8fafc', textColor: '#94a3b8', borderColor: '#cbd5e1',
                                                extendedProps: { isCourseDetail: true, period: c.period, startTime: "", endTime: "" }
                                            });
                                        }
                                    });
                                }
                            }
                        }
                    }
                    checkDate.setDate(checkDate.getDate() + 1);
                }

                showTodaySchedule(allEvents);
                successCallback(allEvents);
                
            } catch (error) { 
                showTodaySchedule(allEvents);
                successCallback(allEvents); 
            }
        },

        eventClick: (info) => {
            const props = info.event.extendedProps;
            
            if (props.isCourseSummary) {
                openCourseSummaryModal(info.event); // ★アラートをやめ、ポップアップで開く
                return;
            }
            if (props.isCourseDetail) {
                openCourseDetailModal(info.event); // 授業単体をクリックした時
                return;
            }
            openModalForDetail(info.event); // 通常の予定
        }
    });
    calendar.render();

    // --- 4. モーダル制御関数 ---

    // ★ 授業のまとめをクリックしたときの専用ポップアップ
    function openCourseSummaryModal(event) {
        resetModalFields();
        const props = event.extendedProps;
        
        document.getElementById("modal-title-text").textContent = "本日の授業一覧";
        document.getElementById("event-title").value = "本日の授業予定"; 
        document.getElementById("event-date").value = event.startStr.split("T")[0];
        
        // 授業リストを詳細(description)に流し込む
        document.getElementById("event-description").value = props.details;
        
        // 閲覧専用なので削除・保存ボタンは隠す
        document.getElementById("delete-event").style.display = "none";
        document.getElementById("save-event").style.display = "none";
        
        modal.classList.add("show");
    }

    function openCourseDetailModal(event) {
        resetModalFields();
        const props = event.extendedProps;
        document.getElementById("modal-title-text").textContent = `授業詳細 (${props.period}限)`;
        document.getElementById("event-title").value = event.title;
        document.getElementById("event-date").value = event.startStr.split("T")[0];
        document.getElementById("event-start-time").value = props.startTime || "";
        document.getElementById("event-end-time").value = props.endTime || "";
        document.getElementById("event-description").value = "※授業予定は設定画面から編集してください。";
        
        document.getElementById("delete-event").style.display = "none";
        document.getElementById("save-event").style.display = "none";
        modal.classList.add("show");
    }

    function openModalForAdd() {
        editingEventId = null; 
        resetModalFields();
        document.getElementById("modal-title-text").textContent = "予定の追加";
        document.getElementById("event-date").value = new Date().toLocaleDateString('sv-SE');
        
        document.getElementById("delete-event").style.display = "none";
        document.getElementById("save-event").style.display = "inline-block";
        modal.classList.add("show");
    }

    function openModalForDetail(event) {
        // FullCalendarのevent.idは文字列として取得される
        editingEventId = event.id || event.extendedProps.originalId;
        const isLocal = event.extendedProps.isLocal;
        resetModalFields();

        document.getElementById("modal-title-text").textContent = isLocal ? "予定の詳細・編集" : "予定の詳細";
        document.getElementById("event-title").value = event.title;
        document.getElementById("event-date").value = event.startStr.split("T")[0];
        document.getElementById("event-start-time").value = event.extendedProps.startTime || "";
        document.getElementById("event-end-time").value = event.extendedProps.endTime || "";
        document.getElementById("event-description").value = event.extendedProps.description || "";
        document.getElementById("event-color").value = event.backgroundColor || "#4da6ff";
        
        document.getElementById("delete-event").style.display = isLocal ? "inline-block" : "none";
        document.getElementById("save-event").style.display = isLocal ? "inline-block" : "none";
        
        modal.classList.add("show");
    }

    // --- 5. 保存・削除アクション ---

    document.getElementById("save-event").onclick = function() {
        const title = document.getElementById("event-title").value;
        const date = document.getElementById("event-date").value;
        if (!title || !date) return alert("予定名と日付は必須です");

        const eventData = { 
            id: editingEventId || "ev_" + Date.now(), title: title, date: date, 
            startTime: document.getElementById("event-start-time").value, endTime: document.getElementById("event-end-time").value, 
            description: document.getElementById("event-description").value, color: document.getElementById("event-color").value 
        };

        if (editingEventId) { 
            const idx = localEvents.findIndex(e => e.id === editingEventId); 
            if (idx !== -1) localEvents[idx] = eventData; 
        } else { localEvents.push(eventData); }
        
        saveAndRefresh();
    };

    document.getElementById("delete-event").onclick = function() {
        if (!editingEventId) {
            alert("この予定は削除できません（IDが見つかりません）");
            return;
        }
        if (confirm("この予定を削除しますか？")) {
            // IDでフィルタリング。文字列として比較することで確実にマッチさせる
            const beforeCount = localEvents.length;
            localEvents = localEvents.filter(e => String(e.id) !== String(editingEventId));
            
            if (localEvents.length === beforeCount) {
                // もしIDで消せなかった場合のバックアップ（同じ名前と日付で消す）
                // ただし、これは最終手段
                const title = document.getElementById("event-title").value;
                const date = document.getElementById("event-date").value;
                localEvents = localEvents.filter(e => !(e.title === title && e.date === date));
            }

            saveAndRefresh();
        }
    };

    function saveAndRefresh() {
        localStorage.setItem("events", JSON.stringify(localEvents));
        calendar.refetchEvents();
        modal.classList.remove("show");
    }

    function resetModalFields() {
        ["event-title", "event-date", "event-start-time", "event-end-time", "event-description"].forEach(id => {
            const el = document.getElementById(id); if(el) el.value = "";
        });
    }

    function showTodaySchedule(allEvents) {
        const list = document.getElementById("today-schedule-list");
        if (!list) return;
        
        const today = new Date().toLocaleDateString('sv-SE');
        
        // 1. 今日の予定を抽出 (isCourseDetail は個別表示するか、まとめ表示するかで分かれる)
        // ここでは、カレンダーの表示モードに関わらず「まとめ」があるならそれを優先し、
        // 個別授業 (isCourseDetail) は、今日の予定リストでは「まとめ」がある場合は除外するなどの調整も可能ですが、
        // シンプルに「isCourseDetail」以外を表示するようにします。
        const items = allEvents.filter(e => {
            const eventDate = e.start ? e.start.split("T")[0] : e.date;
            return eventDate === today && !e.extendedProps?.isCourseDetail;
        });

        // 開始時間でソート（時間は昇順、終日は後ろ）
        items.sort((a, b) => {
            const getTime = (ev) => {
                if (ev.extendedProps?.startTime) return ev.extendedProps.startTime;
                // 管理者用 description に時間が入っている場合はそれを返す
                if (ev.extendedProps?.description && ev.extendedProps.description.includes(':')) return ev.extendedProps.description;
                if (ev.description && ev.description.includes(':')) return ev.description;
                return "ZZ:ZZ"; // 終日は最後に
            };
            return getTime(a).localeCompare(getTime(b));
        });

        
        if (items.length === 0) {
            list.innerHTML = "<li style='color: #64748b; font-size: 0.85rem; padding: 10px;'>今日の予定はありません</li>";
            return;
        }

        // 2. 表示用にHTMLを生成
        list.innerHTML = items.map(e => {
            const props = e.extendedProps || {};
            const color = e.color || e.backgroundColor || '#4da6ff';
            
            // 時間の判定
            let timeStr = "終日";
            if (props.isCourseSummary) {
                timeStr = "終日";
            } else if (props.startTime) {
                timeStr = props.startTime;
                if (props.endTime) timeStr += ` - ${props.endTime}`;
            } else if (props.description && props.description.includes(':')) {
                // 管理者からの連絡など、description に時間が入っている場合
                timeStr = props.description;
            } else if (e.description && e.description.includes(':')) {
                timeStr = e.description;
            }

            // タイトルと詳細
            let title = e.title;
            let description = props.description || "";

            if (props.isCourseSummary) {
                title = "📘 本日の授業予定";
                description = props.details || "";
            }

            // 時間として使用した場合は、詳細欄には表示しない
            if (description === timeStr) description = "";

            return `
                <li class="task">
                    <div class="task-color-bar" style="background: ${color}"></div>
                    <div class="task-content">
                        <div class="task-header">
                            <span class="task-time">${timeStr}</span>
                            <span class="task-title">${title}</span>
                        </div>
                        ${description ? `<div class="task-description">${description.replace(/\n/g, '<br>')}</div>` : ''}
                    </div>
                </li>
            `;
        }).join('');
    }

    document.getElementById("cancel-event").onclick = () => modal.classList.remove("show");
    window.onclick = (e) => { if (e.target == modal) modal.classList.remove("show"); };
});