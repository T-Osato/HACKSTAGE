import json
from datetime import datetime
from flask import Flask,render_template,request, redirect, url_for, flash, abort,jsonify

#SQLAlchemyをインポート
from flask_sqlalchemy import SQLAlchemy 
from sqlalchemy import or_

#Flask-Loginのインポート
from flask_login import LoginManager, UserMixin, login_user, current_user, logout_user,login_required
from werkzeug.security import generate_password_hash, check_password_hash
import os

#--------------------------------------------------------------------#

#グローバル変数の宣言
app : Flask = Flask(__name__)

#Databaseの設定
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///db.sqlite'
db = SQLAlchemy(app)



#ログインマネージャーの設定
app.config['SECRET_KEY'] = os.urandom(24)
login_manager = LoginManager()
login_manager.init_app(app)

#未ログインの場合loginのURLへ強制転送
login_manager.login_view = 'login'

#---------------------------------------------------------------------#

#---------------------------------------------------------------------#

#ユーザーモデルの作成
class User(UserMixin,db.Model):
    #ID(内部管理用)
    #primary_key:行を特定するための「一意の番号」。自動インクリメント機能がある
    id = db.Column(db.Integer, primary_key=True)
    
    #学籍番号（ログインIDとして使用/重複禁止）
    student_id = db.Column(db.String(20), unique=True, nullable=False)
    

     
    #名前(表示用)
    name = db.Column(db.String(50), nullable=False)

    #パスワード（ハッシュ化された値を保存するために長めに設定）
    password = db.Column(db.String(255), nullable=False)

    #サーバー内での権限('admin','user')
    role = db.Column(db.String(20),default = 'user')

#学年暦モデル
class AcademicCalendar(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_date = db.Column(db.Date, nullable=False)
    reason = db.Column(db.String(100))
    category = db.Column(db.String(20), default='holiday') 
    makeup_day = db.Column(db.String(20)) 
    tag_info = db.Column(db.String(50))

# コース予定モデル
class CourseEvent(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_date = db.Column(db.Date, nullable=False) # 日付
    event_time = db.Column(db.String(50))           # 時間（"13:00" や "未定" など自由入力）
    detail = db.Column(db.Text, nullable=False)      # 予定の詳細内容

# --- 既存の User クラスはそのまま ---

# スレッドモデル
class Thread(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False) # スレッドタイトル
    content = db.Column(db.Text, nullable=False)       # 本文（長文対応で Text型）
    tags = db.Column(db.String(100))                   # タグ（"プログラミング,教育" のような形式）
    created_at = db.Column(db.DateTime, default=datetime.now) # 作成日時
    
    # 外部キー：誰がこのスレッドを立てたか (Userのidを参照)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # リレーションシップ：スレッドから作成者の情報にアクセスしやすくする
    author = db.relationship('User', backref=db.backref('threads', lazy=True))

# 返信モデル
class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)       # 返信内容
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    # 外部キー：どのスレッドへの返信か
    thread_id = db.Column(db.Integer, db.ForeignKey('thread.id'), nullable=False)
    # 外部キー：誰が返信したか
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # リレーションシップ
    thread = db.relationship('Thread', backref=db.backref('comments', lazy=True))
    author = db.relationship('User', backref=db.backref('comments', lazy=True))

# 個人のメモ（Memory Log）モデルを追加
class MemoryLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.String(20))
    title = db.Column(db.String(100))
    category = db.Column(db.String(50))
    status = db.Column(db.String(20))
    # 誰のデータか保存する箱（Userモデルと紐付け）
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)


class UserCourse(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    year = db.Column(db.Integer, nullable=False)        # ★ 2026 など
    semester = db.Column(db.String(10), nullable=False)   # 'Spring' or 'Fall'
    day_of_week = db.Column(db.String(10), nullable=False) # 'mon', 'tue'...
    period = db.Column(db.Integer, nullable=False)      # 1〜5
    term = db.Column(db.String(5), nullable=False)       # 'T1', 'T2', 'T3', 'T4'
    course_name = db.Column(db.String(100))

class TermPeriod(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False) # ユーザーごとに設定
    year = db.Column(db.Integer, nullable=False)        # 2026
    term_name = db.Column(db.String(10), nullable=False) # 'T1', 'T2', 'T3', 'T4'
    start_date = db.Column(db.Date, nullable=False)      # 開始日
    end_date = db.Column(db.Date, nullable=False)        # 終了日

class PeriodTime(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    period = db.Column(db.Integer, nullable=False)  # 1, 2, 3, 4, 5
    start_time = db.Column(db.String(5))            # "09:00"
    end_time = db.Column(db.String(5))              # "10:30"
#---------------------------------------------------------------------#

#ユーザーを読み込むためのコールバック
"""
Flask_Loginの「ログイン管理システム」とSQLAlchemyの「データベース」をつなぐ役割
"""
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))
       # user_idがstr型の可能性があるためint型に固定している
#---------------------------------------------------------------------#

#ログインユーザー名を保持する変数
@app.before_request
def set_login_user_name():
    global login_user_name
    login_user_name = current_user.name if current_user.is_authenticated else None
        #current_user.is_authenticated : 今アクセスしている人は、正しくログインしているかを返す
        #ログイン済みなら、current_user.usernameを変数に入れる。未ログインならNoneを入れる

        #その他のルーティング（indexとかsignupとか）を通る前に必ず通る！

#---------------------------------------------------------------------#

#アカウント登録
@app.route('/signup', methods = ['GET','POST'])
def signup():
    if request.method == "GET":
        return render_template("signup.html")
    
    elif request.method == "POST":
        student_id = request.form.get('student_id')
        name = request.form.get('name')
        password = request.form.get('password')
            #request.form.get : ブラウザから送られてきたPOSTデータの中から、特定のキーに対応する値を取り出す

        #最適化：既存のユーザーの重複チェック
        existing_user = User.query.filter_by(student_id=student_id).first()
        if existing_user:
            flash("その学籍番号は既に登録されています")
            return redirect(url_for('signup'))
        
        #Userのインスタンスを作成
        user = User(student_id=student_id,name=name, password=generate_password_hash(password))
        db.session.add(user)
            #db.session.add(user) : この構造体を保存するリストに入れてという予約（DBの書き込みではない！！）
        db.session.commit()
            #変更を確定させる作業
        return redirect(url_for('login'))
    
    #---------------------------------------------------------------------#

#ログイン
@app.route('/', methods=['GET','POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
        
    if request.method == "GET":
        return render_template("login.html")
    
    elif request.method == "POST":
        student_id = request.form.get('student_id')
        password = request.form.get('password')

        #Userテーブルからusernameに一致するユーザーを取得
        user = User.query.filter_by(student_id=student_id).first()

        #ユーザーが存在し、パスワードがあっているかを確認
        if user and check_password_hash(user.password, password):
            login_user(user)
            return redirect(url_for('dashboard'))
        else:
            #パスワードミス
            return "入力内容に誤りがあります"
        

#---------------------------------------------------------------------#

#ログアウト
@app.route('/logout')
def logout():
    logout_user()
    return redirect('/')

#---------------------------------------------------------------------#

@app.route("/dashboard")
@login_required
def dashboard():
    # 1. 管理者が入力したデータを取得
    academic_data = AcademicCalendar.query.all()
    course_data = CourseEvent.query.all()

    # 2. FullCalendarが理解できる形式（リスト）に変換
    calendar_events = []

    # --- 学年暦（休日・振替授業）の処理 ---
    for event in academic_data:
        if event.category == 'makeup':
            # ★振替授業の場合：曜日情報をタイトルに組み込む
            prefix = "【振替】"
            # 曜日が選択されていれば「〇曜日の授業」、なければ既存の情報を表示
            day_label = f"{event.makeup_day}の授業" if event.makeup_day else (event.tag_info or event.reason or "授業")
            display_title = f"{prefix}{day_label}"
            event_color = "#ed8936"  # 振替はオレンジ色
        else:
            # 休日の場合
            prefix = ""
            title_content = event.tag_info if event.tag_info else event.reason
            display_title = f"{prefix}{title_content if title_content else '休日'}"
            event_color = "#ff4d4d"  # 休日は赤色
        
        calendar_events.append({
            "title": display_title,
            "start": event.event_date.isoformat(),
            "color": event_color,
            "allDay": True
        })

    # --- コース予定（講義連絡など）の処理 ---
    for event in course_data:
        calendar_events.append({
            "title": f"【コース】{event.detail}",
            "start": event.event_date.isoformat(),
            "description": event.event_time, 
            "color": "#3182ce"  # コースカラーの青
        })

    # 3. HTMLにデータを渡す
    return render_template(
        "dashboard.html", 
        user=current_user, 
        events_json=json.dumps(calendar_events)
    )

#---------------------------------------------------------------------#

@app.route("/threads", methods=['GET','POST'])
@login_required
def threads():
    if request.method == 'POST':
        #ログイン切れの場合ログイン画面へ
        if not current_user.is_authenticated:
            return redirect(url_for('login'))

        # 1. フォームからデータを受け取る
        title = request.form.get('title')
        tags = request.form.get('tags')
        content = request.form.get('content')

        # 2. データベースに保存
        new_thread = Thread(
            title=title,
            tags=tags,
            content=content,
            user_id=current_user.id # ログイン中のユーザーIDを紐付け
        )
        db.session.add(new_thread)
        db.session.commit()
        
        # 3. 作成後は掲示板トップにリダイレクト
        return redirect(url_for('threads'))
    
    #検索処理
    search_query = request.args.get('search','')

    #クエリの基本形（全件取得の準備）
    query = Thread.query

    if search_query:
        #フィルターをかける
        query = query.filter(
            or_(
                Thread.title.contains(search_query),
                Thread.tags.contains(search_query)
            )
        )

    # GETの場合：データベースから全てのスレッドを「新しい順」に取得
    all_threads = query.order_by(Thread.created_at.desc()).all()
    return render_template("threads.html", threads=all_threads, search_query=search_query)

#---------------------------------------------------------------------#

@app.route("/calendar")
@login_required
def calendar():
    return render_template("calendar.html",user=current_user)

#---------------------------------------------------------------------#

@app.route("/setting")
@login_required
def setting():
    return render_template("setting.html",user=current_user)

#---------------------------------------------------------------------#

@app.route("/change-password")
@login_required
def change_password():
    return render_template("change-password.html",user=current_user)

#---------------------------------------------------------------------#

@app.route("/reset", methods=['GET', 'POST'])
def reset():
    if request.method == 'POST':
        # ここに将来的なパスワードリセットのロジック（メール送信など）を追加できます
        flash("パスワードリセット用のメールを送信しました（モック）")
        return redirect(url_for('login'))
    return render_template("reset.html")

#---------------------------------------------------------------------#

@app.route("/change-name", methods=['GET', 'POST'])
def change_name():
    if not current_user.is_authenticated:
        return redirect(url_for('login'))
        
    if request.method == 'POST':
        new_name = request.form.get('new_name')
        if new_name:
            current_user.name = new_name
            db.session.commit()
            return redirect(url_for('setting'))
            
    return render_template("change-name.html", user=current_user)

#---------------------------------------------------------------------#

@app.route("/delete-account", methods=["POST"])
@login_required
def delete_account():
    user_id = current_user.id
    user_name = current_user.name
    
    # ユーザーに関連するデータを削除
    # ユーザーのコメントを削除
    for comment in Comment.query.filter_by(user_id=user_id).all():
        db.session.delete(comment)
        
    # ユーザーが立てたスレッド(とそれに紐づくコメント)を削除
    for thread in Thread.query.filter_by(user_id=user_id).all():
        for c in thread.comments:
            db.session.delete(c)
        db.session.delete(thread)
        
    # ユーザーを削除
    db.session.delete(current_user)
    db.session.commit()
    
    # ログアウトさせる
    logout_user()
    
    flash(f"アカウント [{user_name}] を削除しました。ご利用ありがとうございました。")
    return redirect(url_for("login"))
    
#---------------------------------------------------------------------#

@app.route('/threads/<int:thread_id>', methods=['GET','POST'])
@login_required
def thread_detail(thread_id):
    #指定されたスレッドidまたは404エラー
    thread = Thread.query.get_or_404(thread_id)
    
    if request.method == 'POST':
        #返信の保存処理
        comment_content = request.form.get('content')
        if comment_content:
            new_comment = Comment(content = comment_content, thread_id = thread.id, user_id = current_user.id)
            db.session.add(new_comment)
            db.session.commit()
        return redirect(url_for("thread_detail",thread_id = thread.id))
    return render_template("thread_detail.html",thread=thread)

#---------------------------------------------------------------------#

@app.route('/threads/<int:thread_id>/delete',methods=['POST'])
@login_required
def delete_thread(thread_id):
    thread = Thread.query.get_or_404(thread_id)

    #権限チェック：作成者本人か確認
    if thread.user_id != current_user.id:
        abort(403)
    
    #関連するコメントを先に削除
    for comment in thread.comments:
        db.session.delete(comment)
    
    db.session.delete(thread)
    db.session.commit()

    #削除後は一覧ページへ戻る
    return redirect(url_for('threads'))

#---------------------------------------------------------------------#

# --- admin_users関数も、リストを表示するためにデータを取得するように修正 ---
@app.route("/admin/users")
@login_required
def admin_users():
    if current_user.role != 'admin':
        abort(403)
    
    all_users = User.query.all()
    # 追加：登録済みの予定も取得して渡す
    academic_list = AcademicCalendar.query.order_by(AcademicCalendar.event_date.desc()).all()
    course_list = CourseEvent.query.order_by(CourseEvent.event_date.desc()).all()
    
    return render_template(
        "admin_users.html", 
        users=all_users, 
        academic_list=academic_list, 
        course_list=course_list
    )

#---------------------------------------------------------------------#

@app.route("/admin/users/<int:target_user_id>/delete", methods=["POST"])
@login_required
def delete_user(target_user_id):
    # 管理者権限チェック
    if current_user.role != 'admin':
        abort(403)
        
    # 自分自身は削除できないように保護
    if current_user.id == target_user_id:
        flash("自分自身を削除することはできません。")
        return redirect(url_for("admin_users"))
        
    target_user = User.query.get_or_404(target_user_id)
    
    # このユーザーが投稿したコメントを全て削除
    for comment in Comment.query.filter_by(user_id=target_user.id).all():
        db.session.delete(comment)
        
    # このユーザーが立てたスレッド(とそれに紐づくコメント)を全て削除
    for thread in Thread.query.filter_by(user_id=target_user.id).all():
        for c in thread.comments:
            db.session.delete(c)
        db.session.delete(thread)
        
    # ユーザーを削除
    db.session.delete(target_user)
    db.session.commit()
    
    flash(f"ユーザー [{target_user.name}] を削除しました。")
    return redirect(url_for("admin_users"))

#---------------------------------------------------------------------#

@app.route("/admin/users/<int:target_user_id>/toggle-role", methods=["POST"])
@login_required
def toggle_user_role(target_user_id):
    # 管理者権限チェック
    if current_user.role != 'admin':
        abort(403)
        
    # 自分自身の権限は変更できないようにする（管理者がいなくなるのを防ぐ）
    if current_user.id == target_user_id:
        flash("自分自身の権限を変更することはできません。")
        return redirect(url_for("admin_users"))
        
    target_user = User.query.get_or_404(target_user_id)
    
    # ロールを切り替え
    if target_user.role == 'admin':
        target_user.role = 'user'
    else:
        target_user.role = 'admin'
        
    db.session.commit()
    flash(f"ユーザー [{target_user.name}] の権限を [{target_user.role}] に変更しました。")
    return redirect(url_for("admin_users"))

#---------------------------------------------------------------------#

# 1. 学年暦の登録（休日や振替授業など）
@app.route('/admin/add_academic_calendar', methods=['POST'])
@login_required
def add_academic_calendar():
    if current_user.role != 'admin':
        abort(403)
    
    # フォームからデータ取得
    date_str = request.form.get('date')
    category = request.form.get('category')   # 'holiday' か 'makeup'
    makeup_day = request.form.get('makeup_day') # ★追加：振替対象の曜日
    tag_info = request.form.get('tag_info')   # 備考
    reason   = request.form.get('reason')     # 予備

    if date_str:
        try:
            # 日付文字列をPythonの日付型に変換
            new_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            
            new_event = AcademicCalendar(
                event_date=new_date, 
                category=category,
                makeup_day=makeup_day, # ★追加：DBに保存
                tag_info=tag_info,
                reason=reason
            )
            db.session.add(new_event)
            db.session.commit()
            flash("学年暦を登録しました")
        except ValueError:
            flash("日付の形式が正しくありません")
    
    return redirect(url_for('admin_users'))


# 2. コース予定の登録（講義連絡やイベントなど）
@app.route('/admin/add_course_event', methods=['POST'])
@login_required
def add_course_event():
    if current_user.role != 'admin':
        abort(403)
    
    # フォームからデータ取得
    date_str = request.form.get('event_date')
    time_str = request.form.get('event_time')
    detail   = request.form.get('event_detail')

    if date_str and detail:
        try:
            # 日付文字列をPythonの日付型に変換
            new_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            
            new_course_event = CourseEvent(
                event_date=new_date,
                event_time=time_str,
                detail=detail
            )
            db.session.add(new_course_event)
            db.session.commit()
            flash("コース予定を登録・配信しました")
        except ValueError:
            flash("日付の形式が正しくありません")
    
    return redirect(url_for('admin_users'))

# 学年暦の削除
@app.route('/admin/delete_academic/<int:event_id>', methods=['POST'])
@login_required
def delete_academic(event_id):
    if current_user.role != 'admin':
        abort(403)
    
    event = AcademicCalendar.query.get_or_404(event_id)
    db.session.delete(event)
    db.session.commit()
    flash("学年暦を削除しました")
    return redirect(url_for('admin_users'))

# コース予定の削除
@app.route('/admin/delete_course_event/<int:event_id>', methods=['POST'])
@login_required
def delete_course_event(event_id):
    if current_user.role != 'admin':
        abort(403)
    
    event = CourseEvent.query.get_or_404(event_id)
    db.session.delete(event)
    db.session.commit()
    flash("コース予定を削除しました")
    return redirect(url_for('admin_users'))

# --- 個人設定ページ ---
@app.route("/settings")
@login_required
def settings():
    return render_template("setting.html", user=current_user)

# --- 授業（時間割）登録ページ ---
@app.route("/settings/courses", methods=['GET', 'POST'])
@login_required
def course_settings():
    if request.method == 'POST':
        # ★デバッグ用：ブラウザからどんなデータが送られてきたかVSCodeのターミナルに表示します
        print("【確認】受信したデータ:", request.form)

        year = request.form.get('year', type=int)
        semester = request.form.get('semester')
        
        # Springなら前ターム=T1/後ターム=T2、FallならT3/T4
        t_first = 'T1' if semester == 'Spring' else 'T3'
        t_second = 'T2' if semester == 'Spring' else 'T4'

        # --- 1. 古いデータを一旦リセット（上書きのため） ---
        UserCourse.query.filter_by(user_id=current_user.id, year=year, semester=semester).delete()
        TermPeriod.query.filter_by(user_id=current_user.id, year=year).delete()
        PeriodTime.query.filter_by(user_id=current_user.id).delete()

        # --- 2. 授業（時間割）の保存 ---
        days = ['mon', 'tue', 'wed', 'thu', 'fri']
        for p in range(1, 6):
            for d in days:
                name1 = request.form.get(f"{d}_{p}_t1")
                name2 = request.form.get(f"{d}_{p}_t2")
                
                if name1 and name1.strip() != "":
                    db.session.add(UserCourse(user_id=current_user.id, year=year, semester=semester, day_of_week=d, period=p, term=t_first, course_name=name1))
                if name2 and name2.strip() != "":
                    db.session.add(UserCourse(user_id=current_user.id, year=year, semester=semester, day_of_week=d, period=p, term=t_second, course_name=name2))

        # --- 3. ターム日程の保存 ---
        for t in ['T1', 'T2', 'T3', 'T4']:
            start_str = request.form.get(f"{t}_start")
            end_str = request.form.get(f"{t}_end")
            if start_str and end_str:
                start_date = datetime.strptime(start_str, '%Y-%m-%d').date()
                end_date = datetime.strptime(end_str, '%Y-%m-%d').date()
                db.session.add(TermPeriod(user_id=current_user.id, year=year, term_name=t, start_date=start_date, end_date=end_date))

        # --- 4. 時限の標準時間の保存 ---
        for p in range(1, 6):
            s_time = request.form.get(f"p{p}_start")
            e_time = request.form.get(f"p{p}_end")
            if s_time and e_time:
                db.session.add(PeriodTime(user_id=current_user.id, period=p, start_time=s_time, end_time=e_time))

        # --- 5. データベースに確定（コミット）★ここをエラー捕獲機能に変更！ ---
        try:
            db.session.commit()
            print("✅ データベースへの保存が【大成功】しました！")
            flash("時間割と設定を保存しました！")
        except Exception as e:
            db.session.rollback()  # エラーが起きたらキャンセル
            print("❌ 【大問題発生】データベース保存エラー:", e)
            flash("保存中にエラーが発生しました（詳細はターミナルを確認）")
        
        return redirect(url_for('course_settings'))

    return render_template("course_settings.html", user=current_user)

#データ取得（授業科目登録ページ）
@app.route("/api/get_timetable")
@login_required
def get_timetable():
    year = request.args.get('year', type=int)
    semester = request.args.get('semester')

    courses = UserCourse.query.filter_by(user_id=current_user.id, year=year, semester=semester).all()
    periods = TermPeriod.query.filter_by(user_id=current_user.id, year=year).all()

    # --- 追加：時限設定の取得 ---
    pt_data = PeriodTime.query.filter_by(user_id=current_user.id).all()
    period_times = {pt.period: {'start': pt.start_time, 'end': pt.end_time} for pt in pt_data}
    # --- ここまで ---

    return jsonify({
        'courses': [{'day': c.day_of_week, 'period': c.period, 'term': c.term, 'name': c.course_name} for c in courses],
        'periods': {p.term_name: {'start': p.start_date.isoformat(), 'end': p.end_date.isoformat()} for p in periods},
        'period_times': period_times  # これをレスポンスに加える
    })

#カレンダーAPI
@app.route("/api/calendar_data")
@login_required
def calendar_data():
    # ユーザーの全授業、全期間、全時限データをデータベースから取得
    courses = UserCourse.query.filter_by(user_id=current_user.id).all()
    periods = TermPeriod.query.filter_by(user_id=current_user.id).all()
    pt_data = PeriodTime.query.filter_by(user_id=current_user.id).all()

    # カレンダーのJavaScriptが読み込みやすい形に整形して送る
    return jsonify({
        'courses': [
            {'day': c.day_of_week, 'period': c.period, 'term': c.term, 'name': c.course_name} 
            for c in courses
        ],
        'periods': [
            {'term': p.term_name, 'start': p.start_date.isoformat(), 'end': p.end_date.isoformat()} 
            for p in periods
        ],
        'period_times': {
            pt.period: {'start': pt.start_time, 'end': pt.end_time} 
            for pt in pt_data
        }
    })
#---------------------------------------------------------------------#

with app.app_context():
    db.create_all()

@app.route('/record')
@login_required
def record_page():
    return render_template('record-page.html')

@app.route('/save', methods=['POST'])
@login_required
def save_log():
    new_log = MemoryLog(
        date=request.form.get('date'),
        title=request.form.get('title'),
        category=request.form.get('category'),
        status=request.form.get('status'),
        user_id=current_user.id
    )
    db.session.add(new_log)
    db.session.commit()
    # 保存が終わったら一覧画面に
    return redirect(url_for('show_list'))

@app.route('/list')
def show_list():
    # 両方のフィルター値を取得
    category_filter = request.args.get('category_filter')
    status_filter = request.args.get('status_filter')

    # まずは全件取得のクエリ（命令）を準備
    query = MemoryLog.query

    # カテゴリーが選ばれていたら条件を追加
    if category_filter:
        query = query.filter_by(category=category_filter)
    
    # ステータスが選ばれていたらさらに条件を追加
    if status_filter:
        query = query.filter_by(status=status_filter)

    # 最後にデータを取得（新しい順にするなら .order_by(MemoryLog.id.desc()) を足すと良いです）
    logs = query.all()
    
    return render_template('record-list.html', logs=logs)
    
@app.route('/delete-log/<int:id>')
@login_required
def delete_log(id):
    log = MemoryLog.query.get_or_404(id)
    if log.user_id != current_user.id:
        abort(403)
    db.session.delete(log)
    db.session.commit()
    return redirect(url_for('show_list'))

@app.route('/edit-log/<int:id>', methods=['GET', 'POST'])
@login_required
def edit_log(id):
    log = MemoryLog.query.get_or_404(id)
    if log.user_id != current_user.id:
        abort(403)
    if request.method == 'POST':
        log.date = request.form.get('date')
        log.title = request.form.get('title')
        log.category = request.form.get('category')
        log.status = request.form.get('status')
        db.session.commit()
        return redirect(url_for('show_list'))
    return render_template('edit-log.html', log=log)

if __name__  == "__main__":
    app.run(debug=True)               
  

