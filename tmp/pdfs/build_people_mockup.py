from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path
from collections import defaultdict
from pypdf import PdfReader

OUT=Path('output/pdf/people-manning-report-mockup.pdf')
for name,file in [('UI','segoeui.ttf'),('Bold','segoeuib.ttf')]:
    pdfmetrics.registerFont(TTFont(name,'C:/Windows/Fonts/'+file))
W,H=612,792
NAVY='#142A43'; MUTED='#65758A'; RULE='#DCE3EB'; PALE='#F3F6FA'
flows=[('Material Handling','#139C91',['Stock Cutting','Shearcut']),('Screen Printing','#0796B5',['Screen-Flat Bed','Screen-Cylinder','Screen-Roll']),('Digital Printing','#8056CF',['Digital-R2000','Digital-3600','Digital-Indigo']),('Finishing Prep','#BA810A',['Lamination','Lamination-LG','Scoring']),('Cutting','#D66D28',['Die Cut','Die Cut-Thermal','Digital Cut','Roll Cut']),('Finishing','#C34A71',['Finishing','Quality Control','Weeding']),('Auxiliary','#60748B',['Art','Ink','Kitting'])]
people=[('Alex Morgan',8,{'Stock Cutting':100}),('Jamie Rivera',8,{'Shearcut':60,'Kitting':40}),('Morgan Lee',6,{'Stock Cutting':50,'Die Cut':50}),('Sam Patel',8,{'Screen-Flat Bed':100}),('Casey Brooks',8,{'Digital-R2000':100}),('Taylor Reed',8,{'Lamination':75,'Scoring':25}),('Jordan Ellis',8,{'Die Cut':50,'Digital Cut':50}),('Riley Chen',8,{'Finishing':100}),('Avery Cole',6,{'Quality Control':100}),('Quinn Davis',8,{'Ink':50,'Kitting':50}),('Drew Parker',4,{'Shearcut':50,'Kitting':50}),('Cameron Wells',8,{'Screen-Flat Bed':50,'Digital-R2000':50})]
people=[(name,hours*5,assignments) for name,hours,assignments in people]
flow_of={dept:flow for flow,col,depts in flows for dept in depts}
alloc=defaultdict(list)
for person,hours,assignments in people:
    for dept,percent in assignments.items(): alloc[dept].append((person,percent,hours*percent/100))
flow_hours={f:sum(a[2] for d in ds for a in alloc[d]) for f,_,ds in flows}
assert abs(sum(flow_hours.values())-sum(p[1] for p in people))<1e-8
c=canvas.Canvas(str(OUT),pagesize=(W,H))
c.setTitle('People | Flow Location Manning - Design Mockup')
c.setAuthor('Scheduler Operations')
def text(x,y,s,size=10,font='UI',color=NAVY):
    c.setFillColor(HexColor(color)); c.setFont(font,size); c.drawString(x,y,str(s))
def right(x,y,s,size=10,font='UI',color=NAVY):
    c.setFillColor(HexColor(color)); c.setFont(font,size); c.drawRightString(x,y,str(s))
def rect(x,y,w,h,color):
    c.setFillColor(HexColor(color)); c.rect(x,y,w,h,fill=1,stroke=0)
def line(y,x=42,end=570):
    c.setStrokeColor(HexColor(RULE)); c.setLineWidth(.6); c.line(x,y,end,y)
def footer(page):
    line(43); text(42,27,'DESIGN MOCKUP  /  Fictional people and illustrative allocations',8,color=MUTED)
    right(570,27,f'{page:02d} / 03',8,color=MUTED)
def header(kicker,title,subtitle,page,color=NAVY):
    rect(0,780,W,12,color)
    text(42,744,'SCHEDULER / PEOPLE',10,'Bold',color)
    right(570,744,'SAMPLE REPORT',9,'Bold',MUTED)
    text(42,714,kicker.upper(),9,'Bold',MUTED)
    text(42,678,title,28,'Bold')
    text(42,655,subtitle,10,color=MUTED)
    footer(page)
def metric(x,y,width,value,label,detail=None):
    rect(x,y,width,77,PALE); text(x+15,y+44,value,24,'Bold'); text(x+15,y+24,label,9,'Bold',MUTED)
    if detail: text(x+15,y+9,detail,8,color=MUTED)

header('Weekly labor allocation','People & manning','September 21-27, 2026  |  Recurring weekly schedule  |  Active people',1)
metric(42,546,168,'12','UNIQUE PEOPLE')
metric(222,546,168,'440.00','WEEKLY LABOR HOURS')
metric(402,546,168,'11.00','TOTAL MANNING')
text(42,516,'Manning by flow location',15,'Bold')
text(42,497,'1.00 manning = 40.00 allocated labor hours for the week.',9,color=MUTED)
rect(42,455,528,27,NAVY)
text(53,464,'FLOW LOCATION',8,'Bold','#FFFFFF'); right(395,464,'PEOPLE*',8,'Bold','#FFFFFF'); right(478,464,'HOURS',8,'Bold','#FFFFFF'); right(558,464,'MANNING',8,'Bold','#FFFFFF')
y=455
for i,(flow,color,depts) in enumerate(flows):
    y-=39
    if i%2==0: rect(42,y,528,39,PALE)
    rect(53,y+14,4,12,color); text(65,y+14,flow,10,'Bold')
    count=len({a[0] for d in depts for a in alloc[d]})
    right(395,y+14,count,10); right(478,y+14,f'{flow_hours[flow]:.2f}',10); right(558,y+14,f'{flow_hours[flow]/40:.2f}',11,'Bold')
    line(y)
y-=35
rect(42,y,528,35,NAVY); text(53,y+12,'SHOP TOTAL',9,'Bold','#FFFFFF'); right(395,y+12,'12',10,'Bold','#FFFFFF'); right(478,y+12,'440.00',10,'Bold','#FFFFFF'); right(558,y+12,'11.00',11,'Bold','#FFFFFF')
text(42,120,'*People can support more than one flow. The shop count is unique people;',9,color=MUTED)
text(42,106,'labor hours and manning are allocated once across all departments.',9,color=MUTED)
text(42,92,'Manning is rounded to two decimals; totals use unrounded allocations.',8,color=MUTED)
text(42,76,'Preview contents: shop summary + two representative flow detail pages.',9,'Bold')
c.showPage()

def details(flow,page):
    _,color,depts=next(row for row in flows if row[0]==flow)
    names=sorted({a[0] for d in depts for a in alloc[d]})
    header('Flow location detail',flow,'September 21-27, 2026  |  Weekly allocated hours and manning',page,color)
    metric(42,546,168,f'{len(names)}','PEOPLE INVOLVED')
    metric(222,546,168,f'{flow_hours[flow]:.2f}','LABOR HOURS IN FLOW')
    metric(402,546,168,f'{flow_hours[flow]/40:.2f}','MANNING IN FLOW')
    text(42,516,'Department coverage',15,'Bold')
    rect(42,475,528,26,NAVY)
    text(53,484,'DEPARTMENT',8,'Bold','#FFFFFF'); right(395,484,'PEOPLE',8,'Bold','#FFFFFF'); right(478,484,'HOURS',8,'Bold','#FFFFFF'); right(558,484,'MANNING',8,'Bold','#FFFFFF')
    y=475
    for i,d in enumerate(depts):
        y-=27
        if i%2==0: rect(42,y,528,27,PALE)
        h=sum(a[2] for a in alloc[d]); text(53,y+10,d,10); right(395,y+10,len(alloc[d])); right(478,y+10,f'{h:.2f}'); right(558,y+10,f'{h/40:.2f}',10,'Bold'); line(y)
    y-=29
    text(53,y+10,'FLOW TOTAL',9,'Bold'); right(478,y+10,f'{flow_hours[flow]:.2f}',10,'Bold'); right(558,y+10,f'{flow_hours[flow]/40:.2f}',10,'Bold'); line(y)
    y-=34; text(42,y,'People supporting this flow',15,'Bold')
    y-=19; text(42,y,'Percentages apply to each person\'s scheduled hours for the week.',9,color=MUTED)
    y-=37; rect(42,y,528,26,NAVY)
    text(53,y+9,'PERSON / DEPARTMENT',8,'Bold','#FFFFFF'); right(395,y+9,'ALLOCATION',8,'Bold','#FFFFFF'); right(478,y+9,'HOURS',8,'Bold','#FFFFFF'); right(558,y+9,'MANNING',8,'Bold','#FFFFFF')
    for i,name in enumerate(names):
        person,hours,assignments=next(p for p in people if p[0]==name)
        matching=[(d,pct) for d,pct in assignments.items() if flow_of[d]==flow]
        rowh=23+len(matching)*18
        y-=rowh
        if i%2==0: rect(42,y,528,rowh,PALE)
        text(53,y+rowh-17,name,10,'Bold'); right(558,y+rowh-17,f'{hours:.2f} weekly hrs',8,color=MUTED)
        for j,(d,pct) in enumerate(matching):
            yy=y+rowh-35-j*18; h=hours*pct/100
            text(63,yy,d,9,color=MUTED); right(395,yy,f'{pct}%',9); right(478,yy,f'{h:.2f}',9); right(558,yy,f'{h/40:.2f}',10,'Bold')
        line(y)
    assert y>130, y
    rect(42,65,528,56,PALE)
    if flow=='Material Handling':
        text(54,103,'SPLIT ASSIGNMENTS',8,'Bold',color)
        text(54,87,'Jamie also supports Kitting; Morgan supports Die Cut; Drew supports Kitting.',8.5,color=MUTED)
        text(54,73,'Only their Material Handling allocation contributes to this page\'s totals.',8.5,color=MUTED)
    else:
        text(54,103,'READING THIS PAGE',8,'Bold',color)
        text(54,87,'Quinn\'s 40.00 hours are split between Ink and Kitting, both within this flow.',8.5,color=MUTED)
        text(54,73,'People involved counts Quinn once. Art is shown with zero assigned hours.',8.5,color=MUTED)
    c.showPage()
details('Material Handling',2)
details('Auxiliary',3)
c.save()
reader=PdfReader(OUT)
assert len(reader.pages)==3
for page in reader.pages: assert 'MANNING' in page.extract_text()
print(OUT.resolve())
print('Verified 3 pages; sample labor totals reconcile to 440 weekly hours / 11 manning.')



