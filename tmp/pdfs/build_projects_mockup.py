from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color, white
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from pypdf import PdfReader

OUT = Path('output/pdf/projects-summary-mockup.pdf')
OUT.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(OUT), pagesize=(612,792))
c.setTitle('Projects - Two-page Summary Mockup')
c.setAuthor('Production Scheduler')
navy=HexColor('#172940'); blue=HexColor('#3267C8'); muted=HexColor('#607086'); line=HexColor('#DCE3EC'); light=HexColor('#F3F6FA'); teal=HexColor('#1C7B6B')

def text(x,y,s,size=10,color=navy,bold=False):
    c.setFillColor(color); c.setFont('Helvetica-Bold' if bold else 'Helvetica',size); c.drawString(x,y,s)

def para(x,y,s,w=516,size=10,color=muted):
    p=Paragraph(s,ParagraphStyle('p',fontName='Helvetica',fontSize=size,leading=size*1.45,textColor=color))
    _,h=p.wrap(w,200); p.drawOn(c,x,y-h); return h

def rule(y):
    c.setStrokeColor(line);c.setLineWidth(.6);c.line(48,y,564,y)

def base(page,label):
    text(48,752,'PRODUCTION SCHEDULER',9,blue,True)
    text(399,752,'PRINT CONCEPT / SAMPLE DATA',8,muted)
    rule(736)
    rule(48);text(48,32,'Bush Hog | Fall launch',8,muted)
    text(357,32,label,8,muted);text(535,32,f'{page} / 2',8,muted)

def section(y,num,title):
    text(48,y,num,10,blue,True);text(74,y,title,15,navy,True)

base(1,'PROJECT OVERVIEW')
text(48,700,'Bush Hog',30,navy,True)
text(48,675,'Fall launch',20,navy)
text(48,648,'Customer: Bush Hog     |     Target: Sep 25, 2026',10,muted)
text(48,629,'Source updated Sep 11, 2026 at 10:00 AM CDT',9,muted)

cards=[('HOURS REMAINING','136','hours'),('WORK IN SCOPE','8','unique WOs'),('PRODUCTION QTY','53,000','ordered units'),('PRODUCTION PROGRESS','35%','operation quantities')]
for i,(label,value,note) in enumerate(cards):
    x=48+i*132
    c.setFillColor(light);c.roundRect(x,503,120,98,6,fill=1,stroke=0)
    text(x+12,581,label,7,muted,True);text(x+12,544,value,25,navy,True);text(x+12,521,note,9,muted)

section(467,'01','Remaining hours by department')
depts=[('Screen print',52),('Digital print',6),('Lamination',18),('Die cutting',24),('Digital cutting',14),('Finishing / pack',22)]
for i,(name,hours) in enumerate(depts):
    y=432-i*34
    text(48,y,name,10)
    c.setFillColor(light);c.roundRect(191,y-2,309,8,3,fill=1,stroke=0)
    c.setFillColor(blue);c.roundRect(191,y-2,309*hours/52,8,3,fill=1,stroke=0)
    text(520,y,f'{hours} h',10,navy,True)

section(207,'02','Project at a glance')
para(48,184,'<b>3 combos + 1 standalone work order</b><br/>Screen print holds the largest share of remaining work: 52 hours (38%).<br/>All four scope items have current source data.',size=11)
rule(110)
para(48,94,'Production progress reflects operation quantities, not hours completed. Project totals count each WO and included operation once.',size=8)
c.showPage()

base(2,'SCOPE SUMMARY')
text(48,700,'Project scope',27,navy,True)
para(48,677,'One summary row per combo or standalone work order.<br/>Combo member WOs remain included in totals without individual listings.',size=10)

# Scope entries deliberately replace internal WO and operation tables.
items=[('COMBO','C-1842','Safety & warning decals','3 WOs','24,000','56 h','40%','Screen print 24 h | Lamination 8 h | Die cutting 12 h | Finishing 12 h'),
       ('COMBO','C-1843','Branding & model decals','2 WOs','16,000','40 h','30%','Screen print 18 h | Lamination 6 h | Die cutting 8 h | Finishing 8 h'),
       ('COMBO','C-1844','Control panel overlays','2 WOs','8,000','28 h','25%','Screen print 10 h | Lamination 4 h | Die cutting 4 h | Digital cutting 10 h'),
       ('WO','WO-48217','BH-420 - Service instructions','1 WO','5,000','12 h','50%','Digital print 6 h | Digital cutting 4 h | Finishing 2 h')]
c.setFillColor(navy);c.rect(48,606,516,25,fill=1,stroke=0)
for x,s in [(60,'SCOPE ITEM'),(305,'WOs'),(356,'QUANTITY'),(429,'HOURS LEFT'),(507,'PROGRESS')]:text(x,615,s,7,white,True)
for i,(kind,identifier,desc,wos,qty,hrs,progress,dept) in enumerate(items):
    top=606-i*94
    if i%2==0:c.setFillColor(light);c.rect(48,top-94,516,94,fill=1,stroke=0)
    text(60,top-20,kind,7,blue,True);text(101,top-20,identifier,11,navy,True)
    text(60,top-38,desc,9)
    text(305,top-20,wos,9);text(356,top-20,qty,10);text(436,top-20,hrs,11,navy,True);text(515,top-20,progress,10,teal,True)
    para(60,top-53,dept,w=488,size=8)
    rule(top-94)
c.setFillColor(navy);c.rect(48,198,516,32,fill=1,stroke=0)
for x,s in [(60,'PROJECT TOTAL'),(305,'8 WOs'),(356,'53,000'),(436,'136 h'),(515,'35%')]:text(x,210,s,9,white,True)

para(48,176,'<b>Progress:</b> Project progress averages included operations; it is not a simple average of the four scope-row percentages.',size=8)
para(48,140,'<b>Completion labels:</b> If a saved item disappears from an accepted upload, its row will show "Inferred complete," zero remaining hours, and its last-known quantity. Returning work resumes live values.',size=8)
para(48,91,'Illustrative values for layout review. Longer scope lists can continue onto page 3 with the same columns and repeated headers.',size=8)
c.save()
pdf=PdfReader(OUT)
assert len(pdf.pages)==2
assert all('SAMPLE DATA' in p.extract_text() for p in pdf.pages)
print(OUT.resolve())
