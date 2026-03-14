from datetime import datetime
from flask import Flask,render_template,request, redirect, url_for, flash, abort

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
def dashboard():
    #ログインしているユーザーに紐づくデータを取得
    return render_template("dashboard.html",user=current_user)
#---------------------------------------------------------------------#

@app.route("/threads", methods=['GET','POST'])
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

@app.route("/calendar")
def calendar():
    return render_template("calendar.html",user=current_user)

@app.route("/setting")
def setting():
    return render_template("setting.html",user=current_user)

@app.route("/change-password")
def change_password():
    return render_template("change-password.html",user=current_user)

@app.route("/reset", methods=['GET', 'POST'])
def reset():
    if request.method == 'POST':
        # ここに将来的なパスワードリセットのロジック（メール送信など）を追加できます
        flash("パスワードリセット用のメールを送信しました（モック）")
        return redirect(url_for('login'))
    return render_template("reset.html")

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

with app.app_context():
    db.create_all()

if __name__  == "__main__":
    app.run(debug=True)               
  

