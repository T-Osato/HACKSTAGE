from datetime import datetime
from flask import Flask,render_template,request, redirect, url_for

#SQLAlchemyをインポート
from flask_sqlalchemy import SQLAlchemy

#Flask-Loginのインポート
from flask_login import LoginManager, UserMixin, login_user, current_user, logout_user
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

#---------------------------------------------------------------------#

#ユーザーモデルの作成
class User(UserMixin,db.Model):
    id = db.Column(db.Integer, primary_key=True)
        #primary_key:行を特定するための「一意の番号」。自動インクリメント機能がある

    username = db.Column(db.String(50), nullable=False, unique=True)
        #nullable = False : 必ずデータが入っている必要がある
        #unique = True : 「重複禁止」
    password = db.Column(db.String(25))
        

#掲示板の一つ一つのメッセージを示すクラス
class Message(db.Model):
    id = db.Column(db.Integer,primary_key = True)
    user_name = db.Column(db.String(100))
    contents = db.Column(db.String(100))

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
    login_user_name = current_user.username if current_user.is_authenticated else None
        #current_user.is_authenticated : 今アクセスしている人は、正しくログインしているかを返す
        #ログイン済みなら、current_user.usernameを変数に入れる。未ログインならNoneを入れる

#---------------------------------------------------------------------#

#アカウント登録
@app.route('/signup', methods = ['GET','POST'])
def signup():
    if request.method == "GET":
        return render_template("signup.html")
    
    elif request.method == "POST":
        username = request.form.get('username')
        password = request.form.get('password')
            #request.form.get : ブラウザから送られてきたPOSTデータの中から、特定のキーに対応する値を取り出す


        #Userのインスタンスを作成
        user = User(username=username, password=generate_password_hash(password))
        db.session.add(user)
            #db.session.add(user) : この構造体を保存するリストに入れてという予約（DBの書き込みではない！！）
        db.session.commit()
            #変更を確定させる作業
        return redirect('login')
    
    #---------------------------------------------------------------------#

#ログイン
@app.route('/login', methods=['GET','POST'])
def login():
    if request.method == "GET":
        return render_template("login.html")
    
    elif request.method == "POST":
        username = request.form.get('username')
        password = request.form.get('password')

        #Userテーブルからusernameに一致するユーザーを取得
        user = User.query.filter_by(username=username).first()
        if check_password_hash(user.password, password):
            login_user(user)
            return redirect('/')

#---------------------------------------------------------------------#

#ログアウト
@app.route('/logout')
def logout():
    logout_user()
    return redirect('/')

#---------------------------------------------------------------------#

#「/」にアクセスがあった場合のルーティング
@app.route("/")
def index():
    #GETメソッドのフォームの値を取得
    search_word:str = request.args.get("search_word")

    #search_wordパラメータの有無
    if search_word is None:
        #search_wordパラメータが存在しない場合は、すべてのメッセージを「top.html」に表示
        message_list: list[Message] = Message.query.all()
    else:
        #search_wordパラメータが存在する場合は、検索ワードでフィルターしたメッセージを「top.html」に表示
        message_list: list[Message] = Message.query.filter(Message.contents.like(f"%{search_word}%")).all()
    
    return render_template(
        "top.html",
        login_user_name = login_user_name,
        message_list = message_list,
        search_word = search_word,
    )

#「/write」にアクセスがあった場合のルーティング
@app.route("/write", methods=["GET","POST"])
def write():
    #GETメソッドの場合
    if request.method == "GET":
        #「write.html」の表示
        return render_template("write.html",login_user_name = login_user_name)
    
    #POSTメソッドの場合
    elif request.method == "POST":
        #POSTメソッドのフォームの値を利用して、新しいメッセージを作成
        contents:str = request.form.get("contents")
        user_name:str = request.form.get("user_name")
        new_message = Message(user_name=user_name,contents=contents)
        db.session.add(new_message)

        #変更をデータベースにコミット
        db.session.commit()

        #「/」にリダイレクト
        return redirect(url_for("index"))
    
#更新機能のルーティング
@app.route("/update/<int:message_id>" , methods=["GET","POST"])
def update(message_id: int):
    #メッセージIDから更新対象のメッセージを取得
    message : Message = Message.query.get(message_id)

    #更新画面を表示
    if request.method == "GET":
        return render_template("update.html", login_user_name= login_user_name, message = message)
    elif request.method == "POST":
        message.contents = request.form.get("contents")
        db.session.commit()
        return redirect(url_for("index")) 

#削除機能のルーティング
@app.route("/delete/<int:message_id>")
def delete(message_id: int):
    #メッセージIDから削除対象のメッセージを取得
    message :Message = Message.query.get(message_id)

    #メッセージを削除
    db.session.delete(message)
    db.session.commit()
    
    return redirect(url_for("index"))

#データベースの初期化
with app.app_context():
    db.create_all()
    
if __name__ == "__main__":
    app.run(debug=True)