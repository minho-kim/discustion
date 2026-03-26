// [v4.0] 피날레 로직이 추가된 백엔드 원본 (압축 해제본)
function doGet(e) {
  let page = 'input'; 
  
  // 압축 해제: if문 중괄호 명시
  if (e.parameter.page) {
    page = e.parameter.page;
  }
  
  return HtmlService.createHtmlOutputFromFile(page)
    .setTitle('토론회 시스템')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
} // End of doGet

function saveData(teamId, pagesData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Data');
  const data = sheet.getDataRange().getValues();
  const timestamp = new Date().getTime();
  
  // 1. 기존 데이터 삭제 (역순 삭제로 인덱스 꼬임 방지)
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] == teamId) {
      sheet.deleteRow(i + 1);
    }
  }
  
  // 2. 새 데이터 삽입
  for (let i = 0; i < pagesData.length; i++) {
    sheet.appendRow([teamId, i + 1, pagesData[i].title, pagesData[i].content, timestamp]);
  }
  
  return true;
} // End of saveData

function setControlStatus(teamId, pageNo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Control');
  
  sheet.getRange('A1').setValue(teamId === null ? '' : teamId);
  sheet.getRange('B1').setValue(pageNo === null ? 1 : pageNo);
  
  return true;
} // End of setControlStatus

function setTimerStatus(state, remainSecs) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Control');
  const now = new Date().getTime();
  
  sheet.getRange('C1').setValue(state);
  sheet.getRange('D1').setValue(remainSecs);
  sheet.getRange('E1').setValue(now);
  
  return true;
} // End of setTimerStatus

function getDisplayData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const controlSheet = ss.getSheetByName('Control');
  const dataSheet = ss.getSheetByName('Data');
  
  const controlValues = controlSheet.getRange('A1:E1').getValues()[0];
  const currentTeam = controlValues[0];
  const currentPage = controlValues[1] || 1;
  const timerData = { 
    state: controlValues[2] || 'reset', 
    remain: controlValues[3] || 0, 
    lastAction: controlValues[4] || 0 
  };
  
  // 1. 대기 상태 검증
  if (currentTeam === '' || currentTeam == null) {
    return { status: 'waiting', timer: timerData };
  }
  
  const data = dataSheet.getDataRange().getValues();
  
  // ★ [신규] 피날레 모드 데이터 추출 로직
  if (currentTeam === 'FINALE') {
    let allTitles = [];
    for (let i = 1; i < data.length; i++) {
      // 제목이 입력된 유효한 데이터만 수집
      if (data[i][2]) { 
        allTitles.push({ team: data[i][0], title: data[i][2] });
      }
    }
    return { status: 'finale', titles: allTitles, timer: timerData };
  }
  
  // 2. 일반 발표 모드 데이터 추출 로직
  let teamPages = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == currentTeam) {
      teamPages.push({ 
        page_no: data[i][1], 
        title: data[i][2], 
        content: data[i][3] 
      });
    }
  }
  
  // 제출된 데이터가 없는 경우
  if (teamPages.length === 0) {
    return { status: 'nodata', teamId: currentTeam, timer: timerData };
  }
  
  // 3. 현재 띄울 특정 페이지 데이터 찾기 (압축 해제 및 명시적 탐색)
  let targetPageData = null;
  for (let i = 0; i < teamPages.length; i++) {
    if (teamPages[i].page_no == currentPage) {
      targetPageData = teamPages[i];
      break;
    }
  }
  
  // 에러 방어: 리모컨 조작 실수로 없는 페이지 번호가 들어왔을 때 강제로 1페이지 표출
  if (targetPageData === null) {
    targetPageData = teamPages[0];
  }
  
  return {
    status: 'show',
    teamId: currentTeam,
    currentPage: targetPageData.page_no,
    totalPages: teamPages.length,
    title: targetPageData.title,
    content: targetPageData.content,
    timer: timerData
  };
} // End of getDisplayData