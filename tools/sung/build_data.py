import json,glob,collections,re
P=json.load(open('synth/all_posts.json'))
raw=json.load(open('raw.json'))
TH=['연준·통화정책','금리·채권','물가','재정·부채','달러·환율','AI·반도체','빅테크·투자사이클','유가·원자재','고용·경기','중국·신흥국','한국 경제·증시','자산배분·전략','투자 마인드','금·대체자산','신용·유동성','지정학·정책']
CAT_LABEL={'(SSH) 매크로 인사이트':'매크로 인사이트','투자에 대한 관점':'투자에 대한 관점','주간 시황(리뷰)':'주간 시황','해외기관 리서치 뷰':'해외기관 리서치','[블챌] 스페셜 포토덤프':'사진','독서 그리고 관점(발췌)':'독서와 관점','딥리서치(교육용)':'딥리서치(교육)','국내기관 리서치 뷰':'국내기관 리서치','추천영상':'영상 소개','이웃분들의 이야기':'이웃 이야기'}
CATS=[c for c in CAT_LABEL if c!='[블챌] 스페셜 포토덤프']
KINDS=['시장진단','개념설명','투자원칙','기관리서치','독서','영상추천','공지·행사','기타']
KIND_LABEL={'영상추천':'영상'}
def fix(s):
    s=(s or '').strip()
    s=s.replace('추천한다','소개한다').replace('추천했다','소개했다').replace('추천하며','소개하며').replace('추천도서','소개 도서').replace('추천 도서','소개 도서').replace('추천','소개')
    return s
IND={'fed':0,'us10y':1,'us2y':2,'cpi':3,'jobs':4,'oil':5,'usd':6,'krw':7,'gold':8,'ai':9,'semis':10,'bigtech':11,'credit':12,'liquidity':13,'fiscal':14,'china':15,'em':16,'kospi':17,'sp500':18,'vix':19,'housing':20,'btc':21}
posts=[]
for p in P:
    posts.append({'id':p['id'],'d':p['date'][:16],'c':CATS.index(p['cat']),'t':p['title'],'o':fix(p['oneLine']),'s':fix(p['summary']),
      'k':KINDS.index(p['kind']) if p['kind'] in KINDS else 7,'th':[TH.index(t) for t in p['themes'] if t in TH],
      'v':fix(p['view']),'p':fix(p['principle']),'tone':{'긍정':1,'중립':0,'경계':-1}.get(p['tone'],0),'lv':p['level'],'val':p['value'],'lk':p['likes']})
# theme monthly counts
months=sorted({p['d'][:7] for p in posts})
tm=[[0]*len(months) for _ in TH]
for p in posts:
    for t in p['th']: tm[t][months.index(p['d'][:7])]+=1
themes=[]
MODEL={1:['^TNX'],5:['^SOX','MU'],6:['^IXIC'],4:['KRW=X'],9:['EEM'],14:['HYG'],10:['^KS11','EWY'],12:['^VIX'],13:[],0:['^TNX']}
for i,t in enumerate(TH):
    s=json.load(open(f'synth/theme_{i:02d}.json'))
    for k in ['headline','plain','core','now']: s[k]=fix(s[k])
    for sh in s['shifts']: sh['text']=fix(sh['text'])
    s['watch']=[fix(w) for w in s['watch']]
    themes.append({'name':t,'n':sum(1 for p in posts if i in p['th']),'monthly':tm[i],'model':MODEL.get(i,[]),**{k:s[k] for k in ['headline','plain','core','shifts','now','watch','best']}})
pr=json.load(open('synth/principles.json'))['principles']
for x in pr: x['title']=fix(x['title']); x['text']=fix(x['text'])
terms=json.load(open('synth/terms.json'))['terms']
for x in terms: x['plain']=fix(x['plain'])
S=json.load(open('synthesis.json'))
ids={p['id'] for p in posts}
def chk(L):
    bad=[i for i in L if i not in ids]
    assert not bad, bad
for th in themes:
    chk(th['best']); [chk(sh['ids']) for sh in th['shifts']]
for x in pr: chk(x['ids'])
for x in terms: chk(x.get('ids',[]))
for x in S['now']+S['frame']+S['eras']: chk(x['ids'])
chk(S['outlooks'])
out={'v':1,'source':{'name':'매크로 비욘드','author':'성상현','blogId':raw['source']['blogId'],'url':'https://m.blog.naver.com/'+raw['source']['blogId'],
     'collectedAt':raw['exportedAt'],'total':raw['postCount'],'analyzed':len(posts),'first':posts[0]['d'][:10],'last':posts[-1]['d'][:10]},
     'cats':[CAT_LABEL[c] for c in CATS],'kinds':[KIND_LABEL.get(k,k) for k in KINDS],'themeNames':TH,'months':months,
     'asOf':S['asOf'],'now':S['now'],'watch':S['watch'],'frame':S['frame'],'eras':S['eras'],'outlooks':S['outlooks'],
     'themes':themes,'principles':pr,'terms':terms,'posts':posts}
json.dump(out,open('/home/claude/momapp/app/www/data/sung.json','w'),ensure_ascii=False,separators=(',',':'))
import os; print('size',os.path.getsize('/home/claude/momapp/app/www/data/sung.json'))
