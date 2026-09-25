from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from pypdf import PdfReader
# Reuse the mockup's sample data and font definitions without generating its pages.
source=Path('tmp/pdfs/build_people_mockup.py').read_text(encoding='utf-8-sig')
exec(source.split('c=canvas.Canvas')[0])
OUT=Path('output/pdf/people-manning-one-page-mockup.pdf')
W,H=792,612
c=canvas.Canvas(str(OUT),pagesize=(W,H))
c.setTitle('People & Manning | One-page Weekly Mockup')
c.setAuthor('Scheduler Operations')
def text(x,y,s,size=9,font='UI',color=NAVY):
    c.setFillColor(HexColor(color)); c.setFont(font,size); c.drawString(x,y,str(s))
def right(x,y,s,size=9,font='UI',color=NAVY):
    c.setFillColor(HexColor(color)); c.setFont(font,size); c.drawRightString(x,y,str(s))
def rect(x,y,w,h,color):
    c.setFillColor(HexColor(color)); c.rect(x,y,w,h,stroke=0,fill=1)
def line(y):
    c.setStrokeColor(HexColor(RULE)); c.setLineWidth(.5); c.line(30,y,762,y)
rect(0,604,792,8,NAVY)
text(30,576,'SCHEDULER / PEOPLE',9,'Bold')
right(762,576,'ONE-PAGE DESIGN MOCKUP',8,'Bold',MUTED)
text(30,544,'Weekly people & manning',25,'Bold')
text(30,524,'September 21-27, 2026  |  Active roster  |  40 weekly hours = 1.00 manning',9,color=MUTED)
rect(30,486,732,25,PALE)
text(42,494,'12 UNIQUE PEOPLE',10,'Bold')
text(270,494,'440.00 WEEKLY HOURS',10,'Bold')
text(547,494,'11.00 TOTAL MANNING',10,'Bold')
rect(30,454,732,24,NAVY)
text(40,462,'FLOW LOCATION',8,'Bold','#FFFFFF')
text(176,462,'DEPARTMENT / MANNING',8,'Bold','#FFFFFF')
text(427,462,'PEOPLE / MANNING IN FLOW',8,'Bold','#FFFFFF')
right(707,462,'HOURS',8,'Bold','#FFFFFF')
right(751,462,'MNG.',8,'Bold','#FFFFFF')
y=454
for i,(flow,color,depts) in enumerate(flows):
    members=[]
    for name,hours,assignments in sorted(people):
        h=sum(hours*p/100 for d,p in assignments.items() if flow_of[d]==flow)
        if h: members.append((name,h/40))
    height=max(len(depts),len(members))*11+13
    y-=height
    if i%2==0: rect(30,y,732,height,PALE)
    rect(30,y,3,height,color)
    top=y+height-15
    text(40,top,flow,9,'Bold')
    text(40,top-14,f'{len(members)} ' + ('person' if len(members)==1 else 'people'),8,color=MUTED)
    for j,d in enumerate(depts):
        text(176,top-j*11,d,9)
        value=sum(a[2] for a in alloc[d])/40
        right(406,top-j*11,f'{value:.2f}',9,'Bold',MUTED if not value else NAVY)
    for j,(name,manning) in enumerate(members):
        text(427,top-j*11,name,9)
        right(650,top-j*11,f'{manning:.2f}',9,'Bold')
    right(707,top,f'{flow_hours[flow]:.2f}',9)
    right(751,top,f'{flow_hours[flow]/40:.2f}',10,'Bold')
    line(y)
assert y>95,y
rect(30,y-27,732,27,NAVY)
text(40,y-18,'SHOP TOTAL',9,'Bold','#FFFFFF')
text(176,y-18,'12 unique people across all flows',9,color='#FFFFFF')
right(707,y-18,'440.00',9,'Bold','#FFFFFF'); right(751,y-18,'11.00',10,'Bold','#FFFFFF')
text(30,63,'People may appear in multiple flows; only their allocated hours count in each flow. Shop totals do not double-count labor.',8,color=MUTED)
text(30,50,'Department and person figures are weekly manning. Values are rounded; totals use unrounded allocations. Zero coverage is shown.',8,color=MUTED)
line(36)
text(30,22,'SAMPLE DATA / Fictional people and illustrative assignments',8,color=MUTED)
right(762,22,'1 / 1',8,color=MUTED)
c.save()
r=PdfReader(OUT)
assert len(r.pages)==1
page=r.pages[0].extract_text()
for flow,_,_ in flows: assert flow in page
for name,_,_ in people: assert name in page
print(OUT.resolve()); print('Verified: one landscape letter page, seven flows, all sample people, 440 hours / 11 manning.')

