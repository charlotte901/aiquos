from pathlib import Path
from docx import Document
from docx.shared import Pt,Cm,RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak,KeepTogether
from reportlab.lib.styles import ParagraphStyle
import pypdfium2 as pdfium
out=Path('docs/导入样题');out.mkdir(exist_ok=True)
Q=[
('单选','低','D1 AI基础认知','智核学院','使用生成式 AI 编写资料摘要后，最恰当的处理方式是什么？',['直接发布，无需检查','核对关键事实与原文是否一致','删除所有引用来源','认为措辞流畅就代表内容正确'],'B','语言流畅不等于事实准确，摘要中的关键结论应与原材料核对。'),
('判断','中','D1 AI基础认知','智核学院','对于同一问题，生成式 AI 每次都给出相同答案，就能证明答案一定正确。',['正确','错误'],'B','输出的一致性不能证明事实正确，仍需使用可靠材料验证。'),
('单选','低','D2 提示词工程','信息迷城','要让 AI 根据一段给定材料整理会议摘要，哪条提示词最明确？',['帮我写点东西','写得专业一些','仅依据下方材料，按议题、决定、待办三项输出；未提及的信息标为未说明','自由补充会议中可能发生的事情'],'C','明确材料范围、输出结构及缺失信息处理方式，有助于减少偏题与补造。'),
('多选','中','D2 提示词工程','信息迷城','设计用于比较两份方案的提示词时，哪些做法有助于得到可核查的结果？',['提供两份方案的原始材料','明确比较指标和输出格式','要求缺失信息标注为未提供','要求无论材料是否充分都给出确定结论'],'A、B、C','提供材料、比较指标及缺失信息规则有利于核查；强求确定结论会掩盖不确定性。'),
('单选','中','D3 AI工具使用','创客工坊','需要对含大量数值的表格进行精确汇总，哪种方案更合适？',['仅让聊天模型估算，不检查结果','使用支持表格计算的工具执行公式，并用样本手工复核','只检查输出是否排版整齐','把计算结果改成最符合预期的数值'],'B','精确汇总应采用可复现的计算过程，并通过抽样复核发现公式或数据错误。'),
('多选','高','D3 AI工具使用','创客工坊','比较两个 AI 工具是否适合某项工作时，应该关注哪些因素？',['相同任务下的结果质量','输入数据的使用限制与隐私要求','操作成本、导出格式和可复现性','只看工具宣传的能力，不做测试'],'A、B、C','工具选择应基于实际任务、数据要求和工作成本，不能仅依据宣传。'),
('单选','低','D4 AI结果评估与优化','伦理殿堂','AI 给出一条看似具体的参考文献，但你无法在原始出版平台找到它，应如何处理？',['直接作为可靠依据引用','把文献标题改短后引用','先核查作者、标题和出版信息，无法验证时不作为事实依据','认为附有年份就一定可信'],'C','参考文献可能被错误生成，未验证的引用不能作为可靠证据。'),
('多选','高','D4 AI结果评估与优化','伦理殿堂','审核一份 AI 生成的分析报告时，哪些检查是必要的？',['核对数据来源和计算方法','区分事实、推断与建议','检查结论是否超出材料支持范围','只要结论符合个人预期就通过'],'A、B、C','审核应关注证据、方法与结论边界，个人偏好不能替代核验。'),
('判断','低','D5 人机协同解决问题','协同空间站','使用 AI 辅助完成任务时，可以由 AI 起草，但关键判断和最终结果仍需责任人核验。',['正确','错误'],'A','AI 可以参与工作流程，但关键判断及交付结果需要人工负责和核验。'),
('多选','高','D5 人机协同解决问题','协同空间站','团队使用 AI 协作整理项目方案，哪些安排更合理？',['明确资料整理、核验和定稿的责任人','保留重要修改及其依据','对有争议的建议进行讨论和核查','让 AI 自动决定所有争议，团队无需复核'],'A、B、C','清晰分工、过程记录和争议核查有助于追溯决策，不能把责任全部交给 AI。'),
('单选','中','D6 AI伦理与合规','伦理殿堂','准备将含客户姓名、电话和业务内容的材料输入外部 AI 工具前，应优先做什么？',['直接上传完整材料','先确认是否允许使用该工具，并按任务需要去除或替换个人信息','只把文件名改掉','认为不公开分享就没有风险'],'B','应先确认数据使用要求，并尽量减少无关个人信息，不能仅依靠改文件名降低风险。'),
('判断','高','D6 AI伦理与合规','伦理殿堂','只要一张图片可以在网上直接下载，就可以不核对许可条件，将其用于商业宣传。',['正确','错误'],'B','能够下载不等于获得商业使用许可，应核对来源、授权范围和署名要求。')]
D=Document();sec=D.sections[0];sec.top_margin=sec.bottom_margin=Cm(1.8)
for name in ['Normal','Title','Heading 1','Heading 2']:
 st=D.styles[name];st.font.name='宋体';st.element.rPr.rFonts.set(qn('w:eastAsia'),'宋体');st.font.color.rgb=RGBColor(0,0,0)
D.styles['Normal'].font.size=Pt(10.5);D.styles['Normal'].paragraph_format.space_after=Pt(4)
D.add_paragraph('AIQUOS 六维能力导入样题','Title')
intro='共 12 题，每个能力维度 2 题；单选 5 题、多选 4 题、判断 3 题。供管理端文档导入与人工审核使用，题目为原创练习题，并非标准化量表。每题均附答案与解析。'
D.add_paragraph(intro)
# Three questions per page keeps answers adjacent to each question.
for i,(typ,diff,dim,level,q,opts,ans,analysis) in enumerate(Q):
 if i and i%3==0:D.add_page_break()
 D.add_paragraph(f'{i+1}. {q}','Heading 2')
 D.add_paragraph(f'题型：{typ}题    难度：{diff}    能力维度：{dim}    类别：{level}')
 for j,t in enumerate(opts):D.add_paragraph(f'{chr(65+j)}. {t}')
 D.add_paragraph('答案：'+ans);D.add_paragraph('解析：'+analysis)
D.save(out/'AIQUOS六维能力导入样题.docx')
pdfmetrics.registerFont(TTFont('Chinese','C:/Windows/Fonts/simsun.ttc',subfontIndex=0))
style=ParagraphStyle('text',fontName='Chinese',fontSize=10,leading=16,spaceAfter=5)
heading=ParagraphStyle('heading',parent=style,fontSize=12,leading=18,spaceBefore=8)
title=ParagraphStyle('title',parent=style,fontSize=19,leading=27,spaceAfter=12)
story=[Paragraph('AIQUOS 六维能力导入样题',title),Paragraph(intro,style),Spacer(1,8)]
for i,(typ,diff,dim,level,q,opts,ans,analysis) in enumerate(Q):
 if i and i%3==0:story.append(PageBreak())
 block=[Paragraph(f'{i+1}. {q}',heading),Paragraph(f'题型：{typ}题　难度：{diff}　能力维度：{dim}　类别：{level}',style)]
 block += [Paragraph(f'{chr(65+j)}. {t}',style) for j,t in enumerate(opts)]
 block += [Paragraph('答案：'+ans,style),Paragraph('解析：'+analysis,style),Spacer(1,8)]
 story.append(KeepTogether(block))
SimpleDocTemplate(str(out/'AIQUOS六维能力导入样题.pdf'),rightMargin=44,leftMargin=44,topMargin=40,bottomMargin=40).build(story)
pdf=pdfium.PdfDocument(str(out/'AIQUOS六维能力导入样题.pdf'));qa=Path('work/sample-doc-qa');qa.mkdir(exist_ok=True)
for i,page in enumerate(pdf):page.render(scale=1.2).to_pil().save(qa/f'pdf-{i+1}.png')
print('PDF pages:',len(pdf));print('questions:',len(Q))
