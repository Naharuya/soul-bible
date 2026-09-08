enum Achievement {
  firstReflection('처음 돌아본 마음', 'First Reflection'), firstSavedVerse('곁에 둔 말씀', 'First Saved Verse'),
  sevenDayJourney('일곱 번의 돌봄', 'Seven Day Journey'), firstShare('다정한 나눔', 'First Share'),
  quietMoment('고요한 순간', 'Quiet Moment'), hopeFinder('희망을 만난 순간', 'Hope Finder');
  const Achievement(this.label, this.englishLabel);
  final String label, englishLabel;
}
