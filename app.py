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


        #Userのインスタンスを作成
        user = User(student_id=student_id,name=name, password=generate_password_hash(password))
        db.session.add(user)
            #db.session.add(user) : この構造体を保存するリストに入れてという予約（DBの書き込みではない！！）
        db.session.commit()
            #変更を確定させる作業
        return redirect(url_for('login'))
    
    #---------------------------------------------------------------------#

#ログイン
@app.route('/login', methods=['GET','POST'])
def login():
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

#「/」にアクセスがあった場合のルーティング
@app.route("/")
def index():
    if current_user.is_authenticated:
        #ログイン済みなら、マイページに飛ばす
        return redirect(url_for("dashboard"))
    else:
        #未ログインなら、ログイン/サインアップの選択画面を出す
        return render_template("landing.html")

@app.route("/dashboard")
def dashboard():
    #ログインしているユーザーに紐づくデータを取得
    return render_template("dashboard.html",user=current_user)
    
with app.app_context():
    db.create_all()

if __name__  == "__main__":
    app.run(debug=True)               
  

