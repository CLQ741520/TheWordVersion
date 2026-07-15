import zipfile
import os
from xml.etree.ElementTree import Element, SubElement, tostring

NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

def create_paragraph(text, style=None, align=None, spacing_after=200):
    p = Element(NS + 'p')
    
    if style or align or spacing_after:
        pPr = SubElement(p, NS + 'pPr')
        if style:
            pStyle = SubElement(pPr, NS + 'pStyle')
            pStyle.set(NS + 'val', style)
        if align:
            jc = SubElement(pPr, NS + 'jc')
            jc.set(NS + 'val', align)
        if spacing_after:
            spacing = SubElement(pPr, NS + 'spacing')
            spacing.set(NS + 'after', str(spacing_after))
    
    r = SubElement(p, NS + 'r')
    t = SubElement(r, NS + 't')
    t.text = text
    
    return p

def create_table(data):
    tbl = Element(NS + 'tbl')
    
    tblPr = SubElement(tbl, NS + 'tblPr')
    tblBorders = SubElement(tblPr, NS + 'tblBorders')
    for border_type in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
        border = SubElement(tblBorders, NS + border_type)
        border.set(NS + 'val', 'single')
        border.set(NS + 'sz', '4')
        border.set(NS + 'space', '0')
        border.set(NS + 'color', '000000')
    
    tblWidth = SubElement(tblPr, NS + 'tblWidth')
    tblWidth.set(NS + 'w', '5000')
    tblWidth.set(NS + 'type', 'dxa')
    
    for row_data in data:
        tr = SubElement(tbl, NS + 'tr')
        for cell_data in row_data:
            tc = SubElement(tr, NS + 'tc')
            
            tcPr = SubElement(tc, NS + 'tcPr')
            tcWidth = SubElement(tcPr, NS + 'tcWidth')
            tcWidth.set(NS + 'w', str(int(5000 / len(row_data))))
            tcWidth.set(NS + 'type', 'dxa')
            
            p = Element(NS + 'p')
            r = SubElement(p, NS + 'r')
            t = SubElement(r, NS + 't')
            t.text = cell_data
            tc.append(p)
    
    return tbl

def generate_docx(output_path):
    content = []
    
    content.append(create_paragraph('TheWord 单词图片识别工具 - 操作手册', 'Heading1', 'center'))
    content.append(create_paragraph('版本：v0.0.1', None, 'center'))
    content.append(create_paragraph('日期：2026年7月', None, 'center'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('目录', 'Heading2'))
    content.append(create_paragraph('1. 系统概述'))
    content.append(create_paragraph('2. 环境要求'))
    content.append(create_paragraph('3. 安装与配置'))
    content.append(create_paragraph('4. 系统运行'))
    content.append(create_paragraph('5. 功能使用'))
    content.append(create_paragraph('6. 数据库说明'))
    content.append(create_paragraph('7. 常见问题'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('1. 系统概述', 'Heading2'))
    content.append(create_paragraph('TheWord是一款基于React + MySQL的单词图片识别工具，用户上传包含英语单词的图片，应用通过OCR识别图片中的单词，自动查询每个单词的音标和中文翻译，生成表格展示结果，支持导出表格。'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('1.1 主要功能', 'Heading3'))
    content.append(create_paragraph('图片上传：支持拖拽上传和点击选择，支持多张图片同时上传'))
    content.append(create_paragraph('OCR识别：通过百度OCR API识别图片中的英语单词'))
    content.append(create_paragraph('单词查询：自动查询单词的音标和中文翻译'))
    content.append(create_paragraph('结果展示：以表格形式展示单词、音标、中译'))
    content.append(create_paragraph('表格导出：支持将识别结果导出为CSV文件'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('1.2 技术栈', 'Heading3'))
    tech_table = [
        ['层级', '技术', '版本'],
        ['前端框架', 'React', '18.x'],
        ['构建工具', 'Vite', '6.x'],
        ['编程语言', 'TypeScript', '5.x'],
        ['数据库', 'MySQL', '8.0+'],
        ['样式', 'Tailwind CSS', '3.x'],
        ['UI组件', 'Radix UI', 'latest'],
        ['图标', 'Lucide React', 'latest'],
    ]
    content.append(create_table(tech_table))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('2. 环境要求', 'Heading2'))
    content.append(create_paragraph('在安装和运行系统前，请确保您的环境满足以下要求：'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('2.1 硬件要求', 'Heading3'))
    content.append(create_paragraph('处理器：Intel Core i3 或更高'))
    content.append(create_paragraph('内存：4GB RAM 或更高'))
    content.append(create_paragraph('磁盘空间：至少 1GB 可用空间'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('2.2 软件要求', 'Heading3'))
    content.append(create_paragraph('操作系统：Windows 10/11、macOS 10.15+、Linux'))
    content.append(create_paragraph('Node.js：版本 20.x 或更高'))
    content.append(create_paragraph('npm：版本 10.x 或更高'))
    content.append(create_paragraph('MySQL：版本 8.0 或更高'))
    content.append(create_paragraph('浏览器：Chrome 90+、Firefox 90+、Edge 90+'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('3. 安装与配置', 'Heading2'))
    content.append(create_paragraph('本章详细介绍如何安装和配置TheWord系统。'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('3.1 下载代码', 'Heading3'))
    content.append(create_paragraph('将项目代码下载到本地目录，例如：'))
    content.append(create_paragraph('D:\\Test\\Person\\Word-app'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('3.2 安装依赖', 'Heading3'))
    content.append(create_paragraph('打开命令行终端，进入项目目录，执行以下命令安装依赖：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('npm install'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('该命令会自动安装package.json中定义的所有依赖包，包括React、Vite、MySQL驱动等。'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('3.3 配置数据库', 'Heading3'))
    content.append(create_paragraph('3.3.1 创建数据库'))
    content.append(create_paragraph('打开MySQL客户端，执行SQL.txt文件中的建表语句：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('CREATE DATABASE IF NOT EXISTS Word_App DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('3.3.2 创建表'))
    content.append(create_paragraph('使用Word_App数据库，创建以下三张表：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('USE Word_App;'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('单词信息表：'))
    content.append(create_paragraph('CREATE TABLE IF NOT EXISTS word_info (id INT AUTO_INCREMENT PRIMARY KEY, word VARCHAR(100) NOT NULL UNIQUE, phonetic VARCHAR(100) DEFAULT "", translation TEXT DEFAULT "", created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_word (word));'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('识别记录表：'))
    content.append(create_paragraph('CREATE TABLE IF NOT EXISTS recognition_record (id INT AUTO_INCREMENT PRIMARY KEY, image_name VARCHAR(255) NOT NULL, image_size INT DEFAULT 0, recognized_words TEXT, status ENUM("success", "failed", "partial") DEFAULT "success", error_message TEXT DEFAULT "", created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_status (status), INDEX idx_created_at (created_at));'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('单词识别关联表：'))
    content.append(create_paragraph('CREATE TABLE IF NOT EXISTS word_recognition (id INT AUTO_INCREMENT PRIMARY KEY, record_id INT NOT NULL, word VARCHAR(100) NOT NULL, FOREIGN KEY (record_id) REFERENCES recognition_record(id) ON DELETE CASCADE, INDEX idx_record_id (record_id), INDEX idx_word (word));'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('3.4 配置环境变量', 'Heading3'))
    content.append(create_paragraph('编辑项目根目录下的.env文件，配置数据库连接信息：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('VITE_DB_HOST=localhost'))
    content.append(create_paragraph('VITE_DB_PORT=3306'))
    content.append(create_paragraph('VITE_DB_USER=root'))
    content.append(create_paragraph('VITE_DB_PASSWORD=your_password'))
    content.append(create_paragraph('VITE_DB_NAME=Word_App'))
    content.append(create_paragraph(''))
    
    env_table = [
        ['参数', '说明', '默认值'],
        ['VITE_DB_HOST', '数据库主机地址', 'localhost'],
        ['VITE_DB_PORT', '数据库端口', '3306'],
        ['VITE_DB_USER', '数据库用户名', 'root'],
        ['VITE_DB_PASSWORD', '数据库密码', ''],
        ['VITE_DB_NAME', '数据库名称', 'Word_App'],
    ]
    content.append(create_table(env_table))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('3.5 配置OCR API', 'Heading3'))
    content.append(create_paragraph('系统使用百度OCR API进行图片识别，需要配置API密钥。在.env文件中添加：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('VITE_OCR_API_KEY=your_ocr_api_key'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('获取方式：'))
    content.append(create_paragraph('1. 访问百度AI开放平台'))
    content.append(create_paragraph('2. 注册并登录账号'))
    content.append(create_paragraph('3. 创建应用，获取API Key和Secret Key'))
    content.append(create_paragraph('4. 使用API Key和Secret Key获取access_token'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('4. 系统运行', 'Heading2'))
    content.append(create_paragraph('本章介绍如何启动和运行TheWord系统。'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('4.1 启动开发服务器', 'Heading3'))
    content.append(create_paragraph('打开命令行终端，进入项目目录，执行以下命令：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('npm run dev'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('启动成功后，终端会显示类似以下信息：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('VITE v6.x.x ready in xxx ms'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('Local: http://localhost:5173/'))
    content.append(create_paragraph('Network: http://192.168.x.x:5173/'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('在浏览器中访问 http://localhost:5173/ 即可打开系统。'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('4.2 构建生产版本', 'Heading3'))
    content.append(create_paragraph('执行以下命令构建生产版本：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('npm run build'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('构建成功后，产物会生成在dist目录中。'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('4.3 代码检查', 'Heading3'))
    content.append(create_paragraph('执行以下命令进行代码检查：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('npm run lint'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('5. 功能使用', 'Heading2'))
    content.append(create_paragraph('本章详细介绍系统各项功能的使用方法。'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('5.1 图片上传', 'Heading3'))
    content.append(create_paragraph('系统提供两种上传方式：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('方式一：拖拽上传'))
    content.append(create_paragraph('将图片文件直接拖拽到上传区域'))
    content.append(create_paragraph('支持同时拖拽多张图片'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('方式二：点击上传'))
    content.append(create_paragraph('点击上传区域'))
    content.append(create_paragraph('在弹出的文件选择对话框中选择图片'))
    content.append(create_paragraph('按住Ctrl键可选择多张图片'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('支持的图片格式：JPG/JPEG、PNG、BMP、WebP'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('注意事项：'))
    content.append(create_paragraph('单张图片大小不超过10MB'))
    content.append(create_paragraph('建议图片清晰，文字清晰可读'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('5.2 删除图片', 'Heading3'))
    content.append(create_paragraph('上传图片后，在缩略图右上角会出现删除按钮：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('鼠标悬停在缩略图上，会显示删除按钮'))
    content.append(create_paragraph('点击删除按钮，即可移除该图片'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('5.3 开始识别', 'Heading3'))
    content.append(create_paragraph('上传图片后，点击开始识别按钮：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('1. 系统会提示正在识别图片中的单词，请稍候'))
    content.append(create_paragraph('2. 系统调用OCR API识别每张图片中的文字'))
    content.append(create_paragraph('3. 从识别结果中提取英文单词'))
    content.append(create_paragraph('4. 查询每个单词的音标和中文翻译'))
    content.append(create_paragraph('5. 展示识别结果表格'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('识别过程中，按钮会显示识别中状态。'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('5.4 查看识别结果', 'Heading3'))
    content.append(create_paragraph('识别完成后，系统会在下方展示单词表格，包含以下列：'))
    content.append(create_paragraph(''))
    
    result_table = [
        ['列名', '说明'],
        ['单词', '识别出的英文单词'],
        ['音标', '单词的音标'],
        ['中译', '单词的中文翻译'],
    ]
    content.append(create_table(result_table))
    content.append(create_paragraph(''))
    content.append(create_paragraph('注意：如果单词未在数据库中找到，音标和中译列会显示横杠。'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('5.5 导出表格', 'Heading3'))
    content.append(create_paragraph('识别完成后，点击导出表格按钮：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('系统会生成CSV格式的文件'))
    content.append(create_paragraph('文件名为单词识别结果_日期.csv'))
    content.append(create_paragraph('文件会自动下载到浏览器默认下载目录'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('导出的CSV文件可以用Excel、WPS等软件打开查看。'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('6. 数据库说明', 'Heading2'))
    content.append(create_paragraph('本章介绍系统使用的数据库表结构。'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('6.1 数据库连接信息', 'Heading3'))
    db_info_table = [
        ['配置项', '值'],
        ['数据库名称', 'Word_App'],
        ['字符集', 'utf8mb4'],
        ['排序规则', 'utf8mb4_unicode_ci'],
        ['存储引擎', 'InnoDB'],
    ]
    content.append(create_table(db_info_table))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('6.2 表结构说明', 'Heading3'))
    content.append(create_paragraph('6.2.1 word_info（单词信息表）'))
    content.append(create_paragraph('存储单词的基本信息，包括单词、音标和中文翻译。'))
    
    word_info_table = [
        ['字段名', '类型', '约束', '说明'],
        ['id', 'INT', 'PRIMARY KEY, AUTO_INCREMENT', '主键ID'],
        ['word', 'VARCHAR(100)', 'NOT NULL, UNIQUE', '英文单词'],
        ['phonetic', 'VARCHAR(100)', 'DEFAULT ""', '音标'],
        ['translation', 'TEXT', 'DEFAULT ""', '中文翻译'],
        ['created_at', 'TIMESTAMP', 'DEFAULT CURRENT_TIMESTAMP', '创建时间'],
        ['updated_at', 'TIMESTAMP', 'ON UPDATE CURRENT_TIMESTAMP', '更新时间'],
    ]
    content.append(create_table(word_info_table))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('6.2.2 recognition_record（识别记录表）'))
    content.append(create_paragraph('记录每次图片识别的详细信息。'))
    
    record_table = [
        ['字段名', '类型', '约束', '说明'],
        ['id', 'INT', 'PRIMARY KEY, AUTO_INCREMENT', '主键ID'],
        ['image_name', 'VARCHAR(255)', 'NOT NULL', '图片文件名'],
        ['image_size', 'INT', 'DEFAULT 0', '图片大小(字节)'],
        ['recognized_words', 'TEXT', '', '识别出的单词列表(JSON)'],
        ['status', 'ENUM', 'success/failed/partial', '识别状态'],
        ['error_message', 'TEXT', 'DEFAULT ""', '错误信息'],
        ['created_at', 'TIMESTAMP', 'DEFAULT CURRENT_TIMESTAMP', '创建时间'],
    ]
    content.append(create_table(record_table))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('6.2.3 word_recognition（单词识别关联表）'))
    content.append(create_paragraph('建立单词与识别记录之间的关联关系。'))
    
    word_rec_table = [
        ['字段名', '类型', '约束', '说明'],
        ['id', 'INT', 'PRIMARY KEY, AUTO_INCREMENT', '主键ID'],
        ['record_id', 'INT', 'NOT NULL, FOREIGN KEY', '识别记录ID'],
        ['word', 'VARCHAR(100)', 'NOT NULL', '单词'],
    ]
    content.append(create_table(word_rec_table))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('7. 常见问题', 'Heading2'))
    content.append(create_paragraph('本章解答使用过程中可能遇到的常见问题。'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('7.1 安装依赖失败', 'Heading3'))
    content.append(create_paragraph('问题：执行npm install时出现错误。'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('解决方案：'))
    content.append(create_paragraph('1. 确保Node.js版本为20.x或更高'))
    content.append(create_paragraph('2. 尝试删除node_modules目录和package-lock.json文件'))
    content.append(create_paragraph('3. 使用npm cache clean --force清理缓存'))
    content.append(create_paragraph('4. 重新执行npm install'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('7.2 数据库连接失败', 'Heading3'))
    content.append(create_paragraph('问题：系统无法连接到MySQL数据库。'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('解决方案：'))
    content.append(create_paragraph('1. 确保MySQL服务已启动'))
    content.append(create_paragraph('2. 检查.env文件中的数据库配置是否正确'))
    content.append(create_paragraph('3. 确保数据库用户有权限访问Word_App数据库'))
    content.append(create_paragraph('4. 确保数据库端口3306未被其他程序占用'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('7.3 OCR识别失败', 'Heading3'))
    content.append(create_paragraph('问题：图片识别过程中出现错误。'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('解决方案：'))
    content.append(create_paragraph('1. 确保已配置VITE_OCR_API_KEY'))
    content.append(create_paragraph('2. 检查网络连接是否正常'))
    content.append(create_paragraph('3. 确保图片清晰，文字可读'))
    content.append(create_paragraph('4. 检查图片大小是否超过10MB限制'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('7.4 识别结果为空', 'Heading3'))
    content.append(create_paragraph('问题：识别完成后没有显示任何单词。'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('可能原因：'))
    content.append(create_paragraph('1. 图片中不包含英文单词'))
    content.append(create_paragraph('2. 图片文字模糊，OCR无法识别'))
    content.append(create_paragraph('3. 图片被遮挡或裁剪'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('解决方案：'))
    content.append(create_paragraph('1. 上传包含清晰英文单词的图片'))
    content.append(create_paragraph('2. 确保图片完整，文字未被遮挡'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('7.5 导出表格失败', 'Heading3'))
    content.append(create_paragraph('问题：点击导出表格按钮没有反应。'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('解决方案：'))
    content.append(create_paragraph('1. 确保已完成图片识别，有识别结果'))
    content.append(create_paragraph('2. 检查浏览器是否阻止了下载'))
    content.append(create_paragraph('3. 尝试使用其他浏览器'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('附录A：项目结构', 'Heading2'))
    content.append(create_paragraph('项目目录结构说明：'))
    content.append(create_paragraph(''))
    content.append(create_paragraph('Word-app/'))
    content.append(create_paragraph('public/ - 静态资源目录'))
    content.append(create_paragraph('images/ - 图片资源'))
    content.append(create_paragraph('src/ - 源代码目录'))
    content.append(create_paragraph('components/ - React组件'))
    content.append(create_paragraph('ui/ - UI组件'))
    content.append(create_paragraph('db/ - 数据库配置'))
    content.append(create_paragraph('services/ - 业务服务'))
    content.append(create_paragraph('pages/ - 页面组件'))
    content.append(create_paragraph('utils/ - 工具函数'))
    content.append(create_paragraph('types/ - 类型定义'))
    content.append(create_paragraph('App.tsx - 应用入口'))
    content.append(create_paragraph('main.tsx - 主入口'))
    content.append(create_paragraph('routes.tsx - 路由配置'))
    content.append(create_paragraph('index.css - 全局样式'))
    content.append(create_paragraph('SQL.txt - 数据库建表语句'))
    content.append(create_paragraph('.env - 环境变量配置'))
    content.append(create_paragraph('package.json - 依赖配置'))
    content.append(create_paragraph('vite.config.ts - Vite配置'))
    content.append(create_paragraph(''))
    
    content.append(create_paragraph('附录B：核心文件说明', 'Heading2'))
    file_table = [
        ['文件路径', '说明'],
        ['src/pages/WordOcrPage.tsx', '主页面，包含上传、识别、展示逻辑'],
        ['src/services/ocrService.ts', 'OCR识别服务'],
        ['src/services/wordInfoService.ts', '单词信息查询服务'],
        ['src/db/mysql.ts', 'MySQL数据库配置'],
        ['src/utils/extractWords.ts', '英文单词提取工具'],
        ['src/utils/exportCsv.ts', 'CSV导出工具'],
        ['src/utils/fileToBase64.ts', '文件转Base64工具'],
    ]
    content.append(create_table(file_table))
    
    body_content = '\n'.join([tostring(e, encoding='unicode') for e in content])
    
    document_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    document_xml += '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n'
    document_xml += '  <w:body>\n'
    document_xml += body_content
    document_xml += '    <w:p><w:r><w:t></w:t></w:r></w:p>\n'
    document_xml += '    <w:sectPr>\n'
    document_xml += '      <w:pgSz w:w="11906" w:h="16838"/>\n'
    document_xml += '      <w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>\n'
    document_xml += '    </w:sectPr>\n'
    document_xml += '  </w:body>\n'
    document_xml += '</w:document>'
    
    style_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    style_xml += '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n'
    style_xml += '  <w:style w:type="paragraph" w:styleId="Heading1">\n'
    style_xml += '    <w:name w:val="Heading 1"/>\n'
    style_xml += '    <w:basedOn w:val="Normal"/>\n'
    style_xml += '    <w:next w:val="Normal"/>\n'
    style_xml += '    <w:qFormat/>\n'
    style_xml += '    <w:rPr>\n'
    style_xml += '      <w:sz w:val="32"/>\n'
    style_xml += '      <w:szCs w:val="32"/>\n'
    style_xml += '      <w:b/>\n'
    style_xml += '      <w:bCs/>\n'
    style_xml += '    </w:rPr>\n'
    style_xml += '    <w:pPr><w:spacing w:before="300" w:after="200"/><w:jc w:val="center"/></w:pPr>\n'
    style_xml += '  </w:style>\n'
    style_xml += '  <w:style w:type="paragraph" w:styleId="Heading2">\n'
    style_xml += '    <w:name w:val="Heading 2"/>\n'
    style_xml += '    <w:basedOn w:val="Normal"/>\n'
    style_xml += '    <w:next w:val="Normal"/>\n'
    style_xml += '    <w:qFormat/>\n'
    style_xml += '    <w:rPr>\n'
    style_xml += '      <w:sz w:val="28"/>\n'
    style_xml += '      <w:szCs w:val="28"/>\n'
    style_xml += '      <w:b/>\n'
    style_xml += '      <w:bCs/>\n'
    style_xml += '    </w:rPr>\n'
    style_xml += '    <w:pPr><w:spacing w:before="240" w:after="180"/></w:pPr>\n'
    style_xml += '  </w:style>\n'
    style_xml += '  <w:style w:type="paragraph" w:styleId="Heading3">\n'
    style_xml += '    <w:name w:val="Heading 3"/>\n'
    style_xml += '    <w:basedOn w:val="Normal"/>\n'
    style_xml += '    <w:next w:val="Normal"/>\n'
    style_xml += '    <w:qFormat/>\n'
    style_xml += '    <w:rPr>\n'
    style_xml += '      <w:sz w:val="24"/>\n'
    style_xml += '      <w:szCs w:val="24"/>\n'
    style_xml += '      <w:b/>\n'
    style_xml += '      <w:bCs/>\n'
    style_xml += '    </w:rPr>\n'
    style_xml += '    <w:pPr><w:spacing w:before="200" w:after="160"/></w:pPr>\n'
    style_xml += '  </w:style>\n'
    style_xml += '  <w:style w:type="paragraph" w:styleId="Normal">\n'
    style_xml += '    <w:name w:val="Normal"/>\n'
    style_xml += '    <w:rPr>\n'
    style_xml += '      <w:sz w:val="20"/>\n'
    style_xml += '      <w:szCs w:val="20"/>\n'
    style_xml += '    </w:rPr>\n'
    style_xml += '    <w:pPr><w:spacing w:after="120"/><w:indent w:firstLineChars="400"/></w:pPr>\n'
    style_xml += '  </w:style>\n'
    style_xml += '</w:styles>'
    
    with zipfile.ZipFile(output_path, 'w') as zf:
        zf.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n<Default Extension="xml" ContentType="application/xml"/>\n<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles.main+xml"/>\n</Types>')
        
        zf.writestr('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n</Relationships>')
        
        zf.writestr('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\n</Relationships>')
        
        zf.writestr('word/document.xml', document_xml)
        zf.writestr('word/styles.xml', style_xml)
    
    print('文档已生成：' + output_path)

if __name__ == '__main__':
    output_path = os.path.join(os.path.dirname(__file__), '操作手册.docx')
    generate_docx(output_path)
