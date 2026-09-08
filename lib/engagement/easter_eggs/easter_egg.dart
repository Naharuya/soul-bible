enum EasterEgg {
  smallLight('작은 빛', '말씀을 곁에 두는 작은 공간이 생겼어요.'),
  journeyGarden('빛의 정원', '일곱 번의 돌봄을 기억하는 정원이에요.'),
  gratitudeCard('감사의 별', '고마운 순간들을 조용히 기억해요.');
  const EasterEgg(this.label, this.message);
  final String label, message;
}
