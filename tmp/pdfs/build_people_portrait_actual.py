from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader
from pathlib import Path
import math
for name,file in [('UI','segoeui.ttf'),('Bold','segoeuib.ttf')]: pdfmetrics.registerFont(TTFont(name,'C:/Windows/Fonts/'+file))
flows=[
 ('Material Handling','#139c91',48,'1.20',[('Shearcut','0.20'),('Stock Cutting','1.00')],[('Keith','0.20'),('Tyler','1.00')]),
 ('Screen Printing','#0796b5',456,'11.40',[('Ink','1.00'),('Screen-Cylinder','5.67'),('Screen-Flat Bed','4.50'),('Screen-Roll','0.23')],[('Bee','1.00'),('Brian - Screen Shoot','1.00'),('Bruce','0.00'),('Chang','1.00'),('Dan','1.00'),('Ernest','0.90'),('Geillermo','1.00'),('Jeff N','1.00'),('Jon','1.00'),('Jonah','1.00'),('Lee','0.50'),('Temp - Jaumal Screen Shoot','1.00'),('Toni - Screen Shoot','1.00')]),
 ('Digital Printing','#8056cf',196,'4.90',[('Digital-3600','0.45'),('Digital-Indigo','1.00'),('Digital-R2000','3.45')],[('Chelsea','1.00'),('Jeramy','1.00'),('Peter','1.00'),('Shane','0.90'),('Vince','1.00')]),
 ('Finishing Prep','#ba810a',222,'5.55',[('Lamination','3.50'),('Lamination-LG','0.25'),('Scoring','1.80')],[('Brian','0.75'),('Dennis','1.00'),('Keith','0.80'),('Mike','1.00'),('Temp - Vang','1.00'),('TK','1.00')]),
 ('Cutting','#d66d28',288,'7.20',[('Die Cut','4.00'),('Digital Cut','2.65'),('Digital Cut-G3','0.30'),('Roll Cut','0.25')],[('Andrew','1.00'),('Angela','0.20'),('Angie','0.25'),('Brendan','1.00'),('Brian','0.25'),('Lee','0.50'),('Matt','1.00'),('Sandy','1.00'),('Toy','1.00'),('Vicky','1.00')]),
 ('Finishing','#c34a71',677,'16.93',[('Finishing','8.93'),('Heat Bend','2.00'),('Kitting','2.00'),('Quality Control','2.00'),('Weeding','2.00')],[('Dena QC','1.00'),('Em','1.00'),('Gladys','1.00'),('Griselda','1.00'),('Jean','0.63'),('Lynn','1.00'),('Shelley - QC','1.00'),('Sue','1.00'),('Temp - Faith','1.00'),('Temp - John','1.00'),('Temp - Marcus','1.00'),('Temp - Mee','1.00'),('Temp - Renee','1.00'),('Temp - Sharde','1.00'),('Temp - Solomon','1.00'),('Temp - Susan','1.00'),('Toni (Anthony)','1.00'),('Twanika','0.30')]),
 ('Auxiliary','#60748b',0,'0.00',[],[])
]
NAVY='#142a43'; MUTED='#65758a'; PALE='#f3f6fa'; RULE='#dce3eb'
out=Path('output/pdf/people-manning-portrait-actual-mockup.pdf')
c=canvas.Canvas(str(out),pagesize=(612,792)); c.setTitle('People & Manning | Portrait Layout Preview'); c.setAuthor('Scheduler Operations')
def text(x,y,s,size=8.4,font='UI',color=NAVY):
 c.setFont(font,size); c.setFillColor(HexColor(color)); c.drawString(x,y,str(s))
def right(x,y,s,size=8.4,font='UI',color=NAVY):
 c.setFont(font,size); c.setFillColor(HexColor(color)); c.drawRightString(x,y,str(s))
def rect(x,y,w,h,color):
 c.setFillColor(HexColor(color)); c.rect(x,y,w,h,stroke=0,fill=1)
def rule(y):
 c.setStrokeColor(HexColor(RULE)); c.setLineWidth(.5); c.line(36,y,576,y)
rect(0,784,612,8,NAVY)
text(36,758,'SCHEDULER / PEOPLE',9,'Bold'); right(576,758,'PORTRAIT LAYOUT PREVIEW',8,'Bold',MUTED)
text(36,730,'Weekly people & manning',24,'Bold')
text(36,710,'September 21-27, 2026 | Active roster | 40 weekly hours = 1.00 manning',9,color=MUTED)
for x,val,label in [(36,'51','UNIQUE PEOPLE'),(220,'1,887.00','WEEKLY HOURS'),(404,'47.17','TOTAL MANNING')]:
 rect(x,662,172,36,PALE); text(x+10,680,val,15,'Bold'); text(x+10,669,label,7,'Bold',MUTED)
rect(36,633,540,22,NAVY)
text(44,641,'DEPARTMENT / MANNING',7.4,'Bold','#ffffff'); text(212,641,'PEOPLE / MANNING IN FLOW',7.4,'Bold','#ffffff')
y=633
for flow,color,hours,manning,depts,people in flows:
 rows=max(len(depts),math.ceil(len(people)/2))
 height=28+rows*11.3 if rows else 28
 bottom=y-height
 rect(36,bottom,540,height, '#ffffff')
 rect(36,y-21,540,21,PALE); rect(36,y-21,3,21,color)
 text(44,y-14,flow,10,'Bold'); text(215,y-14,f'{len(people)} people',8,color=MUTED)
 right(490,y-14,f'{hours:,.2f} hrs',8.6); right(566,y-14,f'{manning} mng',9.5,'Bold')
 for i,(dept,value) in enumerate(depts):
  yy=y-33-i*11.3; text(44,yy,dept); right(192,yy,value,8.4,'Bold')
 split=math.ceil(len(people)/2)
 for i,(name,value) in enumerate(people):
  column=i//split; row=i%split
  x=212+column*181; end=380+column*181; yy=y-33-row*11.3
  assert pdfmetrics.stringWidth(name,'UI',8.4)<end-x-25,(name,'too long')
  text(x,yy,name); right(end,yy,value,8.4,'Bold')
 if not people: text(300,y-14,'No assigned departments or people',8,color=MUTED)
 rule(bottom); y=bottom
assert y>100,y
rect(36,y-27,540,27,NAVY)
text(44,y-18,'SHOP TOTAL',9,'Bold','#ffffff'); text(215,y-18,'51 unique people',8,color='#ffffff'); right(490,y-18,'1,887.00 hrs',8.6,'Bold','#ffffff'); right(566,y-18,'47.17 mng',9.5,'Bold','#ffffff')
text(36,65,'People shared across flows appear in each relevant section; allocated labor is counted only once.',7.6,color=MUTED)
text(36,53,'Figures and rounding are preserved from your supplied report. All department/person values are manning.',7.6,color=MUTED)
rule(40)
text(36,26,'Actual roster | Source generated Sep 25, 2026, 12:59 PM CDT',7.5,color=MUTED); right(576,26,'1 / 1',8,color=MUTED)
c.save()
r=PdfReader(out); assert len(r.pages)==1
extracted=r.pages[0].extract_text()
for flow,col,hours,manning,depts,people in flows:
 assert flow in extracted
 for name,val in depts+people: assert name in extracted
assert sum(f[2] for f in flows)==1887
print(out.resolve()); print('One portrait page; all 54 flow/person appearances retained; 51 unique people as reported.')
