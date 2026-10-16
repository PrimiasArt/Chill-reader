/**
 * Offline Sino-Vietnamese & Web Novel (Tu Tiên, Kiếm Hiệp, Huyền Huyễn) Dictionary Service
 * 100% Offline, Fast & Zero Latency
 */

export interface NovelTermDefinition {
  term: string;
  hanzi?: string;
  pinyin?: string;
  category: 'Cảnh giới' | 'Khái niệm Tu Chân' | 'Võ học & Pháp thuật' | 'Vật phẩm & Linh dược' | 'Thế giới & Xã hội' | 'Thuật ngữ Hán Việt';
  shortDesc: string;
  detailDesc: string;
  examples?: string[];
}

export interface HanVietCharacter {
  syllable: string; // e.g. "càn"
  hanzi: string;    // e.g. "乾"
  pinyin?: string;  // e.g. "qián"
  meanings: string[]; // e.g. ["Trời", "Quẻ Càn (Dương)", "Phương Tây Bắc"]
}

export interface HanVietLookupResult {
  query: string;
  termMatch?: NovelTermDefinition;
  characterMatches: HanVietCharacter[];
  relatedTerms: NovelTermDefinition[];
}

// 1. Comprehensive Web Novel & Tu Tiên Dictionary
export const NOVEL_TERMS: NovelTermDefinition[] = [
  // Cảnh giới tu chân
  {
    term: 'Luyện Khí',
    hanzi: '练气',
    pinyin: 'Liàn qì',
    category: 'Cảnh giới',
    shortDesc: 'Tầng đầu tiên của con đường tu chân, hấp thu thiên địa linh khí vào cơ thể.',
    detailDesc: 'Giai đoạn sơ khởi của tu tiên giả. Thường chia từ tầng 1 đến tầng 9 (hoặc tầng 10-13 viên mãn). Người tu luyện đả tọa hấp thu linh khí trong trời đất, tẩy rửa tạp chất nhục thân, khai thông kinh mạch để biến thành chân khí.',
    examples: ['Hắn khổ tu mười năm rốt cuộc cũng đột phá Luyện Khí tầng ba.']
  },
  {
    term: 'Trúc Cơ',
    hanzi: '筑基',
    pinyin: 'Zhù jī',
    category: 'Cảnh giới',
    shortDesc: 'Xây dựng nền móng đại đạo vững chắc, chuyển hóa chân khí từ dạng khí sang thể lỏng.',
    detailDesc: 'Giai đoạn "đặt nền móng" để bước vào cảnh giới chân chính của người tu tiên. Khi Trúc Cơ thành công, thọ mệnh tăng lên 200 - 300 năm, đan điền chân khí ngưng tụ thành dịch thể linh dịch, có thể ngự kiếm phi hành sơ cấp.',
    examples: ['Cần có Trúc Cơ Đan để tăng xác suất đột phá thành công.']
  },
  {
    term: 'Kim Đan',
    hanzi: '金丹',
    pinyin: 'Jīn dān',
    category: 'Cảnh giới',
    shortDesc: 'Cô đọng toàn bộ linh dịch trong đan điền thành một viên đan màu vàng óng.',
    detailDesc: 'Cột mốc "Nhất lạp kim đan thôn nhập phúc, thủy tri ngã mệnh do ngã bất do thiên". Linh dịch trong đan điền ngưng kết thành Kim Đan rắn chắc. Thọ mệnh đạt từ 500 đến 800 năm. Bắt đầu có thể điều khiển pháp bảo chân chính.',
    examples: ['Kim Đan sơ kỳ đã đủ để trở thành trưởng lão của một tiểu tông môn.']
  },
  {
    term: 'Nguyên Anh',
    hanzi: '元婴',
    pinyin: 'Yuán yīng',
    category: 'Cảnh giới',
    shortDesc: 'Phá vỡ Kim Đan, dựng nên một hài nhi linh hồn bất tử trong đan điền.',
    detailDesc: 'Đỉnh cao của các tu sĩ tại hạ giới. Kim Đan vỡ ra sinh ra Nguyên Anh giống hệt bản thể thu nhỏ. Thọ mệnh vượt qua ngàn năm. Dù thể xác bị hủy diệt, Nguyên Anh vẫn có thể xuất khiếu chạy trốn hoặc đoạt xá tái sinh.',
    examples: ['Lão tổ Nguyên Anh vừa hiện thân, uy áp đè bẹp vạn chúng.']
  },
  {
    term: 'Hóa Thần',
    hanzi: '化神',
    pinyin: 'Huà shén',
    category: 'Cảnh giới',
    shortDesc: 'Nguyên Anh lột xác dung hợp cùng thiên địa, lĩnh ngộ ý cảnh sơ bộ.',
    detailDesc: 'Thần niệm có thể bao trùm một quốc gia hay một đại lục. Bắt đầu tiếp xúc với quy tắc và bản nguyên của thiên địa. Thọ mệnh từ 2.000 đến 5.000 năm.',
    examples: ['Hóa Thần đại năng xé rách không gian, một bước ngàn dặm.']
  },
  {
    term: 'Luyện Hư',
    hanzi: '炼虚',
    pinyin: 'Liàn xū',
    category: 'Cảnh giới',
    shortDesc: 'Rèn luyện thần hồn nhập vào hư không, cảm ngộ quy tắc không gian.',
    detailDesc: 'Tu sĩ bắt đầu thích nghi với không gian hư vô, thân thể hóa hư, không còn bị ràng buộc bởi vật chất thông thường.',
    examples: ['Đột phá Luyện Hư cảnh giới cần độ qua hư không phong bạo.']
  },
  {
    term: 'Hợp Thể',
    hanzi: '合体',
    pinyin: 'Hé tǐ',
    category: 'Cảnh giới',
    shortDesc: 'Hợp nhất hoàn toàn Nguyên Anh, Pháp Thân và Nhục Thân làm một thể.',
    detailDesc: 'Thần thể viên mãn, lực lượng bộc phát có thể chấn vỡ tinh thần nhỏ, sinh mệnh lực bền bỉ đạt tới cảnh giới bất tử bất diệt tương đối.',
    examples: ['Hợp Thể kỳ cự đầu xưng bá một phương Linh Giới.']
  },
  {
    term: 'Đại Thừa',
    hanzi: '大乘',
    pinyin: 'Dà chéng',
    category: 'Cảnh giới',
    shortDesc: 'Cảnh giới đại thành viên mãn của phàm giới trước khi phi thăng Tiên Giới.',
    detailDesc: 'Giai đoạn tích lũy linh lực và cảm ngộ thiên đạo tới mức tối đa, chuẩn bị nghênh đón Thiên Kiếp để hóa thân thành Tiên nhân.',
    examples: ['Đại Thừa viên mãn chỉ còn chờ đợi lôi kiếp buông xuống.']
  },
  {
    term: 'Độ Kiếp',
    hanzi: '渡劫',
    pinyin: 'Dù jié',
    category: 'Cảnh giới',
    shortDesc: 'Thời khắc đối mặt với Thiên Lôi giáng phạt để thoát xác phàm nhân.',
    detailDesc: 'Thiên đạo hạ lôi phạt nhằm thử thách và đào thải những kẻ nghịch thiên. Vượt qua kiếp nạn sẽ phi thăng Tiên Giới, thất bại nhẹ thì thành Tán Tiên, nặng thì hồn phi phách tán.',
    examples: ['Cửu Cửu Thiên Kiếp uy lực kinh thiên, vạn người độ kiếp chỉ một người thành.']
  },
  {
    term: 'Chân Tiên',
    hanzi: '真仙',
    pinyin: 'Zhēn xiān',
    category: 'Cảnh giới',
    shortDesc: 'Bước vào ngưỡng cửa Tiên Giới, chuyển hóa linh lực thành tiên nguyên.',
    detailDesc: 'Cảnh giới tiên nhân chân chính đầu tiên sau khi phi thăng, thọ mệnh trường thọ gần như vô cùng tận nếu không gặp thiên nhân ngũ suy.',
  },

  // Khái niệm Tu Chân
  {
    term: 'Đan Điền',
    hanzi: '丹田',
    pinyin: 'Dān tián',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Nơi tích tụ và ngưng kết linh khí, chân khí chủ yếu trong cơ thể.',
    detailDesc: 'Gồm Hạ Đan Điền (dưới rốn, nơi ngưng tụ chân khí/Kim đan), Trung Đan Điền (vùng ngực, khí hải), và Thượng Đan Điền (mi tâm, nơi chứa thần thức linh hồn). Đan điền bị vỡ đồng nghĩa với phế bỏ toàn bộ tu vi.',
    examples: ['Hắn vận chuyển chân khí một chu thiên rồi dẫn về hạ đan điền.']
  },
  {
    term: 'Thần Thức',
    hanzi: '神识',
    pinyin: 'Shén shí',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Giác quan tâm linh vô hình, có thể quét nhìn và cảm ứng vạn vật xung quanh.',
    detailDesc: 'Tương đương với sóng radar sinh học của người tu tiên. Thần thức càng mạnh thì bán kính cảm ứng càng xa, có thể nhìn thấu ngụy trang, tra xét túi trữ vật và dùng để công kích tinh thần đối phương.',
    examples: ['Hắn phóng thích thần thức bao trùm toàn bộ sơn cốc.']
  },
  {
    term: 'Linh Căn',
    hanzi: '灵根',
    pinyin: 'Líng gēn',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Tư chất bẩm sinh để cảm ứng và hấp thu các thuộc tính ngũ hành linh khí.',
    detailDesc: 'Phân loại: Đơn Linh Căn (Thiên Linh Căn - tư chất tuyệt đỉnh), Song Linh Căn, Tam Linh Căn, Tứ Linh Căn, Ngũ Linh Căn (Tạp Linh Căn - tu luyện cực chậm). Ngoài ra còn có Dị Linh Căn hiếm gặp như Lôi, Băng, Phong, Ám, Quang.',
    examples: ['Sở hữu Thiên Linh Căn Hỏa hệ, tốc độ tu luyện nhanh gấp mười lần người thường.']
  },
  {
    term: 'Đoạt Xá',
    hanzi: '夺舍',
    pinyin: 'Duó shè',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Dùng thần hồn/Nguyên Anh chiếm đoạt thân xác của người khác để sống lại.',
    detailDesc: 'Quy tắc tu chân thông thường: mỗi người chỉ có thể đoạt xá tối đa một lần trong đời, nếu không thần hồn sẽ tiêu tán hoặc bị phản phệ. Cần nhắm vào người có tu vi thấp hơn hoặc thể xác không có phòng bị.',
    examples: ['Lão ma đầu bị nổ tung thân xác, chỉ còn hồn phách chờ thời cơ đoạt xá.']
  },
  {
    term: 'Tẩy Tủy',
    hanzi: '洗髓',
    pinyin: 'Xǐ suǐ',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Tẩy rửa tủy xương và kinh mạch, loại bỏ tạp chất của phàm thai.',
    detailDesc: 'Quá trình thanh lọc thể xác nhằm nâng cao tư chất tu luyện, thường dùng Tẩy Tủy Đan hoặc linh dịch ngâm tắm.',
    examples: ['Sau một đêm tẩy tủy phạt mao, toàn thân hắn toát ra một lớp bùn đen hôi thối.']
  },
  {
    term: 'Bế Quan',
    hanzi: '闭关',
    pinyin: 'Bì guān',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Khóa chặt phòng tu luyện, cắt đứt giao tiếp thế giới bên ngoài để tập trung ngộ đạo.',
    detailDesc: 'Tu sĩ bế quan có thể kéo dài từ vài tháng, vài năm đến hàng trăm năm để đột phá cảnh giới nan giải hoặc chữa trị nội thương trầm trọng.',
    examples: ['Chưởng môn tuyên bố bế quan ba năm để trùng kích Hóa Thần.']
  },
  {
    term: 'Tẩu Hỏa Nhập Ma',
    hanzi: '走火入魔',
    pinyin: 'Zǒu huǒ rù mó',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Kinh mạch nghịch hành hoặc tâm tính hỗn loạn do nóng vội, dính bẫy tâm ma.',
    detailDesc: 'Chân khí mất kiểm soát tàn phá nội tạng kinh mạch, thần trí phát điên, nhẹ thì mất hết công lực thành phế nhân, nặng thì nổ tung đan điền tử vong.',
    examples: ['Cưỡng ép đột phá khi tâm cảnh chưa vững sẽ rất dễ bị tẩu hỏa nhập ma.']
  },
  {
    term: 'Tâm Ma',
    hanzi: '心魔',
    pinyin: 'Xīn mó',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Ám ảnh, tội lỗi, chấp niệm sâu kín trong tâm trí trỗi dậy quấy phá lúc ngộ đạo.',
    detailDesc: 'Thường xuất hiện khi tu sĩ vượt thiên kiếp hoặc phá cảnh giới. Tâm ma sẽ hiện ra những hình ảnh bi kịch hoặc cám dỗ ngọt ngào nhất để khiến tu sĩ sa ngã.',
    examples: ['Nếu không dứt bỏ được mối thù này, nó sẽ hóa thành tâm ma vĩnh viễn ngăn cản ngươi thành đạo.']
  },
  {
    term: 'Đạo Lữ',
    hanzi: '道侣',
    pinyin: 'Dào lǚ',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Bạn đồng hành kết tóc trên con đường cầu đạo trường sinh (bạn đời tu tiên).',
    detailDesc: 'Khác với vợ chồng phàm tục, đạo lữ cùng nhau song tu, chia sẻ tài nguyên, bảo vệ lẫn nhau vượt qua khảo nghiệm sinh tử suốt hàng trăm ngàn năm.',
    examples: ['Hai người lập thiên địa thệ ngôn, nguyện kết làm đạo lữ vĩnh viễn không rời.']
  },
  {
    term: 'Thiên Kiếp',
    hanzi: '天劫',
    pinyin: 'Tiān jié',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Sự trừng phạt và thử thách bằng sấm sét (Lôi kiếp) do Thiên đạo giáng xuống.',
    detailDesc: 'Vì tu tiên là hành vi nghịch thiên cải mệnh, thiên địa sẽ tạo ra các tầng sấm lôi uy áp (Tứ Cửu, Lục Cửu, Cửu Cửu Thiên Kiếp) để thử thách đạo tâm và nhục thân.',
    examples: ['Mây đen vần vũ vạn dặm, Thiên Kiếp chuẩn bị buông xuống đỉnh núi.']
  },
  {
    term: 'Tán Tu',
    hanzi: '散修',
    pinyin: 'Sǎn xiū',
    category: 'Thế giới & Xã hội',
    shortDesc: 'Người tu tiên tự do, không thuộc về bất kỳ môn phái hay gia tộc nào.',
    detailDesc: 'Phải tự thân lăn lộn kiếm từng viên linh thạch, bí kíp, đan dược nơi nguy hiểm hoang dã. Cuộc sống bấp bênh nhưng tự do tự tại, tâm tính thường thâm trầm giảo hoạt.',
    examples: ['Làm tán tu thì tài nguyên thiếu thốn, sinh tử khó lường.']
  },
  {
    term: 'Tông Môn',
    hanzi: '宗门',
    pinyin: 'Zōng mén',
    category: 'Thế giới & Xã hội',
    shortDesc: 'Hệ thống trường phái, giáo phái tu chân truyền dạy công pháp đạo thuật.',
    detailDesc: 'Cơ cấu thường bao gồm: Thái Thượng Trưởng Lão -> Chưởng Môn -> Trưởng Lão chấp pháp/đan các -> Đệ tử chân truyền -> Đệ tử nội môn -> Đệ tử ngoại môn -> Tạp dịch.',
    examples: ['Thanh Vân Môn là đệ nhất chính đạo tông môn của vùng đất này.']
  },
  {
    term: 'Động Phủ',
    hanzi: '洞府',
    pinyin: 'Dòng fǔ',
    category: 'Thế giới & Xã hội',
    shortDesc: 'Nơi cư trú và bế quan tu luyện của tu sĩ, thường đặt tại nơi có linh mạch.',
    detailDesc: 'Được bố trí các trận pháp bảo vệ nghiêm ngặt, tụ linh trận để gom linh khí, có dược viên trồng thảo dược và luyện đan thất.',
    examples: ['Hắn mở một hang động đá nơi vách núi hiểm trở để làm lâm thời động phủ.']
  },

  // Vật phẩm & Pháp bảo
  {
    term: 'Pháp Bảo',
    hanzi: '法宝',
    pinyin: 'Fǎ bǎo',
    category: 'Vật phẩm & Linh dược',
    shortDesc: 'Vũ khí hoặc bảo vật có linh tính, được tu sĩ tế luyện bằng tinh huyết.',
    detailDesc: 'Phân cấp phổ biến: Phù Khí -> Pháp Khí -> Linh Khí -> Pháp Bảo -> Cổ Bảo -> Linh Bảo Thông Thiên -> Tiên Khí. Pháp bảo có thể thu nhỏ đưa vào trong cơ thể để uẩn dưỡng.',
    examples: ['Thanh phi kiếm này là Bản Mệnh Pháp Bảo mà hắn đã ôn dưỡng năm mươi năm.']
  },
  {
    term: 'Túi Trữ Vật',
    hanzi: '储物袋',
    pinyin: 'Chǔ wù dài',
    category: 'Vật phẩm & Linh dược',
    shortDesc: 'Túi vải nhỏ chứa không gian không gian độc lập rộng lớn bên trong.',
    detailDesc: 'Vật dụng tùy thân của hầu hết tu sĩ. Dùng thần thức để lấy ra hoặc cất vào đồ vật. Cấp cao hơn là Giới Chỉ Trữ Vật (Nhẫn không gian) hoặc Trữ Vật Vòng Tay.',
    examples: ['Hắn giật lấy túi trữ vật từ thắt lưng của tên địch nhân vừa ngã xuống.']
  },
  {
    term: 'Linh Thạch',
    hanzi: '灵石',
    pinyin: 'Líng shí',
    category: 'Vật phẩm & Linh dược',
    shortDesc: 'Khoáng thạch kết tinh linh khí thuần khiết, đơn vị tiền tệ chính giới tu chân.',
    detailDesc: 'Dùng để thanh toán giao dịch, cung cấp năng lượng cho trận pháp hoặc trực tiếp cầm tay để hấp thụ linh khí hồi phục tu vi. Phân làm Hạ phẩm, Trung phẩm, Thượng phẩm và Cực phẩm linh thạch.',
    examples: ['Một viên cực phẩm linh thạch tương đương với mười vạn hạ phẩm linh thạch.']
  },
  {
    term: 'Khôi Lỗi',
    hanzi: '傀儡',
    pinyin: 'Kuǐ lěi',
    category: 'Võ học & Pháp thuật',
    shortDesc: 'Người máy hoặc thú máy cơ quan được chế tạo để chiến đấu hoặc làm việc.',
    detailDesc: 'Được điều khiển bằng thần niệm hoặc gắn linh thạch, tinh hồn thú để tự động hành động theo mệnh lệnh của chủ nhân.',
    examples: ['Khôi Lỗi Thú cấp ba có sức chiến đấu tương đương tu sĩ Trúc Cơ hậu kỳ.']
  },
  {
    term: 'Phù Triện',
    hanzi: '符箓',
    pinyin: 'Fú lù',
    category: 'Võ học & Pháp thuật',
    shortDesc: 'Giấy bùa vẽ các phù văn phong ấn sẵn sức mạnh của pháp thuật.',
    detailDesc: 'Người sử dụng chỉ cần rót vào một chút linh lực là có thể kích hoạt uy lực pháp thuật tức thì mà không cần thời gian niệm chú.',
    examples: ['Trong lúc nguy cấp, hắn vung ra ba tấm Thổ Độn Phù để độn thổ tẩu thoát.']
  },
  {
    term: 'Trận Pháp',
    hanzi: '阵法',
    pinyin: 'Zhèn fǎ',
    category: 'Võ học & Pháp thuật',
    shortDesc: 'Bố trí trận kỳ, trận bàn theo quy luật càn khôn để khống chế thiên địa lực lượng.',
    detailDesc: 'Gồm hộ sơn trận pháp, khốn trận (giam cầm), sát trận (tấn công tiêu diệt), và huyễn trận (gây ảo giác mê cung).',
    examples: ['Nhập vào Hộ Sơn Đại Trận của đối phương chẳng khác nào đâm đầu vào chỗ chết.']
  },
  {
    term: 'Cấm Chế',
    hanzi: '禁制',
    pinyin: 'Jìn zhì',
    category: 'Võ học & Pháp thuật',
    shortDesc: 'Các lớp phong ấn phù văn bao quanh cổ mộ, động phủ hoặc phong ấn bảo vật.',
    detailDesc: 'Khác với trận pháp cần nguồn năng lượng quy mô lớn, cấm chế là các mắt xích phong ấn liên hoàn tinh vi bảo vệ chống lại người ngoài xâm nhập.',
    examples: ['Muốn mở chiếc hộp cổ này phải phá giải chín tầng cấm chế huyết mạch.']
  },
  {
    term: 'Thần Thông',
    hanzi: '神通',
    pinyin: 'Shén tōng',
    category: 'Võ học & Pháp thuật',
    shortDesc: 'Kỹ năng pháp thuật uy lực tuyệt luân vượt xa chiêu thức võ công tầm thường.',
    detailDesc: 'Thường do tu sĩ đạt tới cảnh giới cao tự ngộ hoặc thừa kế từ huyết mạch thượng cổ. Có thể hô phong hoán vũ, di sơn đảo hải, biến hóa khôn lường.',
    examples: ['Thi triển bổn mạng thần thông khiến khí tức của hắn tăng vọt trong tích tắc.']
  },

  // Thuật ngữ Hán Việt triết học & Kiếm hiệp
  {
    term: 'Càn Khôn',
    hanzi: '乾坤',
    pinyin: 'Qián kūn',
    category: 'Thuật ngữ Hán Việt',
    shortDesc: 'Trời và Đất, Âm và Dương, biểu trưng cho toàn thể vũ trụ bao la.',
    detailDesc: 'Xuất phát từ Kinh Dịch: Càn là quẻ đầu tiên (Trời, Dương, Vua, Sáng), Khôn là quẻ thứ hai (Đất, Âm, Nhu, Tối). Càn khôn đại diện cho sự vận hành biến hóa của trời đất và thế giới.',
    examples: ['Đảo chuyển càn khôn, biến họa thành phúc.']
  },
  {
    term: 'Hỗn Độn',
    hanzi: '混沌',
    pinyin: 'Hùn dùn',
    category: 'Thuật ngữ Hán Việt',
    shortDesc: 'Trạng thái nguyên sơ mờ mịt chưa phân chia trước khi trời đất khai sinh.',
    detailDesc: 'Trước khi Bàn Cổ khai thiên lập địa, vũ trụ chỉ là một khối hỗn độn không có hình hài, không có thanh trọc, ẩn chứa nguồn năng lượng vô tận sơ khai.',
    examples: ['Thanh kiếm này ẩn chứa một tia Hỗn Độn Khí của thời kỳ sơ khai.']
  },
  {
    term: 'Bát Quái',
    hanzi: '八卦',
    pinyin: 'Bā guà',
    category: 'Thuật ngữ Hán Việt',
    shortDesc: 'Tám quẻ cơ bản trong Kinh Dịch biểu thị các trạng thái tự nhiên.',
    detailDesc: 'Bao gồm: Càn (Trời), Khôn (Đất), Chấn (Sấm), Tốn (Gió), Khảm (Nước), Ly (Lửa), Cấn (Núi), Đoài (Hồ/Đầm). Được dùng để bói toán, tính trận pháp và binh pháp.',
    examples: ['Chân đạp Bát Quái Bộ thoắt ẩn thoắt hiện né tránh lưỡi gươm đối thủ.']
  },
  {
    term: 'Âm Dương',
    hanzi: '阴阳',
    pinyin: 'Yīn yáng',
    category: 'Thuật ngữ Hán Việt',
    shortDesc: 'Hai mặt đối lập mà thống nhất, nương tựa nhau để sinh thành vạn vật.',
    detailDesc: 'Âm đại diện cho tối, lạnh, nhu, tĩnh, nữ; Dương đại diện cho sáng, ấm, cương, động, nam. Khi âm dương mất cân bằng thì sinh ra bệnh tật, tai ương hoặc hoại diệt.',
    examples: ['Âm dương hòa hợp, thiên địa trường tồn.']
  },
  {
    term: 'Tích Cốc',
    hanzi: '辟谷',
    pinyin: 'Bì gǔ',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Không ăn thức ăn ngũ cốc trần tục, chỉ hấp thu thiên địa linh khí hoặc linh đan để sống.',
    detailDesc: 'Khi tu sĩ đạt đến cảnh giới nhất định (thường từ Trúc Cơ), cơ thể thanh tịnh không còn nhu cầu ăn uống phàm trần để tránh tích tụ cặn bã ô uế.',
    examples: ['Hắn đã tích cốc hơn mười năm, chỉ uống sương mai đầu ngọn cỏ.']
  },
  {
    term: 'Nghịch Thiên',
    hanzi: '逆天',
    pinyin: 'Nì tiān',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Đi ngược lại quy luật của tự nhiên và thiên đạo (cải tử hoàn sinh, đoạt mạng trời).',
    detailDesc: 'Khẩu hiệu kinh điển của nhân vật chính trong truyện tu tiên: "Ngã mệnh do ngã bất do thiên" (Mạng ta do ta định đoạt chứ không do trời). Càng nghịch thiên thì hình phạt thiên kiếp càng khốc liệt.',
    examples: ['Hành động luyện chế cấm đan này quả thực là đại nghịch thiên.']
  },
  {
    term: 'Hóa Hình',
    hanzi: '化形',
    pinyin: 'Huà xíng',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Yêu thú hoặc linh thực tu luyện đạt tới cảnh giới cao lột xác thành hình hài con người.',
    detailDesc: 'Yêu thú khi đột phá cấp bậc tương đương Nguyên Anh thường phải vượt qua Hóa Hình Lôi Kiếp để có được hình người và trí tuệ sánh ngang nhân loại.',
    examples: ['Bạch xà tu luyện ngàn năm rốt cuộc cũng hóa hình thành thiếu nữ xinh đẹp.']
  },
  {
    term: 'Đan Các',
    hanzi: '丹阁',
    pinyin: 'Dān gé',
    category: 'Thế giới & Xã hội',
    shortDesc: 'Khu vực hoặc điện các chuyên nghiên cứu, chế tạo và bán dược thảo, linh đan.',
    detailDesc: 'Nơi tập trung các Luyện Đan Sư trong môn phái, có địa vị rất cao do là nguồn cung cấp đan dược cho toàn môn.',
    examples: ['Đến Đan Các đổi điểm cống hiến lấy Tụ Khí Đan.']
  },
  {
    term: 'Khí Hải',
    hanzi: '气海',
    pinyin: 'Qì hǎi',
    category: 'Võ học & Pháp thuật',
    shortDesc: 'Biển khí, vị trí tích tụ nội lực dưới rốn trong võ học kiếm hiệp.',
    detailDesc: 'Khí hải càng sâu rộng thì nội lực phát ra càng dồi dào, đánh lâu không mệt mỏi.',
    examples: ['Chưởng phong hùng hậu bắt nguồn từ chân khí cuồn cuộn trong khí hải.']
  },
  {
    term: 'Kiếm Ý',
    hanzi: '剑意',
    pinyin: 'Jiàn yì',
    category: 'Võ học & Pháp thuật',
    shortDesc: 'Cảnh giới tinh thần tối cao của kiếm khách, truyền thần niệm vào lưỡi kiếm.',
    detailDesc: 'Thứ kiếm khách ngộ ra được từ nhân sinh và thiên địa. Khi xuất kiếm kèm theo Kiếm Ý, uy lực tăng lên gấp bội, có thể chấn nhiếp linh hồn đối thủ.',
    examples: ['Hắn đứng lặng dưới trăng ba ngày ba đêm, cuối cùng cũng lĩnh ngộ được Sát Lục Kiếm Ý.']
  },
  {
    term: 'Kiếm Khí',
    hanzi: '剑气',
    pinyin: 'Jiàn qì',
    category: 'Võ học & Pháp thuật',
    shortDesc: 'Chân khí ngưng kết phóng ra từ mũi kiếm chém nát vật thể từ xa.',
    detailDesc: 'Đòn tấn công tầm xa bằng khí phong sắc bén của người luyện kiếm thành thục.',
    examples: ['Kiếm khí tung hoành ba ngàn dặm, một kiếm quang hàn thập cửu châu.']
  },
  {
    term: 'Kinh Mạch',
    hanzi: '经脉',
    pinyin: 'Jīng mài',
    category: 'Khái niệm Tu Chân',
    shortDesc: 'Hệ thống đường dẫn vô hình luân chuyển chân khí và khí huyết trong cơ thể.',
    detailDesc: 'Gồm Thập Nhị Chính Kinh và Kỳ Kinh Bát Mạch (Nhâm Mạch, Đốc Mạch...). Đả thông toàn bộ kinh mạch giúp khí lực tuần hoàn thông suốt không bị nghẽn tắc.',
    examples: ['Một dòng nhiệt lưu ấm áp chảy xiết qua các đường kinh mạch bị tắc nghẽn.']
  }
];

// 2. Comprehensive Han-Viet Syllables & Morpheme Dictionary
export const HAN_VIET_SYLLABLES: Record<string, HanVietCharacter> = {
  // Ngũ hành & Tự nhiên
  'kim': { syllable: 'kim', hanzi: '金', pinyin: 'jīn', meanings: ['Vàng', 'Kim loại cứng rắn', 'Một trong ngũ hành', 'Quý giá'] },
  'mộc': { syllable: 'mộc', hanzi: '木', pinyin: 'mù', meanings: ['Cây cối', 'Gỗ', 'Tính chất mộc mạc', 'Một trong ngũ hành'] },
  'thủy': { syllable: 'thủy', hanzi: '水', pinyin: 'shuǐ', meanings: ['Nước', 'Chất lỏng', 'Dòng chảy êm dịu mà hiểm trở', 'Một trong ngũ hành'] },
  'hỏa': { syllable: 'hỏa', hanzi: '火', pinyin: 'huǒ', meanings: ['Lửa', 'Ánh sáng nhiệt lượng', 'Tính nóng nảy mãnh liệt', 'Một trong ngũ hành'] },
  'thổ': { syllable: 'thổ', hanzi: '土', pinyin: 'tǔ', meanings: ['Đất đai', 'Vùng đất quê hương', 'Nền tảng vững chãi', 'Một trong ngũ hành'] },
  'lôi': { syllable: 'lôi', hanzi: '雷', pinyin: 'léi', meanings: ['Sấm sét', 'Tiếng sấm vang rền uy mãnh'] },
  'băng': { syllable: 'băng', hanzi: '冰', pinyin: 'bīng', meanings: ['Băng giá', 'Lạnh lẽo buốt giá', 'Đông cứng'] },
  'phong': { syllable: 'phong', hanzi: '风', pinyin: 'fēng', meanings: ['Gió', 'Tốc độ nhanh như chớp', 'Phong thái phong độ'] },
  'quang': { syllable: 'quang', hanzi: '光', pinyin: 'guāng', meanings: ['Ánh sáng', 'Rực rỡ vinh quang', 'Chiếu rọi'] },
  'ám': { syllable: 'ám', hanzi: '暗', pinyin: 'àn', meanings: ['Tối tăm', 'Ẩn giấu bí mật', 'U tối mờ mịt'] },
  'hư': { syllable: 'hư', hanzi: '虚', pinyin: 'xū', meanings: ['Hư không', 'Trống rỗng', 'Hư vô hư ảo', 'Yếu ớt'] },
  'không': { syllable: 'không', hanzi: '空', pinyin: 'kōng', meanings: ['Không gian', 'Hư không trống rỗng', 'Tĩnh lặng vô thường'] },
  'huyền': { syllable: 'huyền', hanzi: '玄', pinyin: 'xuán', meanings: ['Huyền bí', 'Sâu thẳm khó lường', 'Màu đen thẫm', 'Đạo gia'] },
  'thiên': { syllable: 'thiên', hanzi: '天', pinyin: 'tiān', meanings: ['Trời', 'Thiên đường', 'Quy luật tự nhiên tối cao', 'Bầu trời'] },
  'địa': { syllable: 'địa', hanzi: '地', pinyin: 'dì', meanings: ['Đất', 'Mặt đất nâng đỡ vạn vật', 'Vùng đất'] },

  // Cảnh giới & Tồn tại
  'tiên': { syllable: 'tiên', hanzi: '仙', pinyin: 'xiān', meanings: ['Tiên nhân', 'Thoát tục trường sinh', 'Thần thánh thanh tao'] },
  'thần': { syllable: 'thần', hanzi: '神', pinyin: 'shén', meanings: ['Thần linh', 'Tinh thần linh hồn', 'Kỳ diệu mầu nhiệm'] },
  'ma': { syllable: 'ma', hanzi: '魔', pinyin: 'mó', meanings: ['Ma quỷ', 'Tà niệm chấp niệm', 'Cám dỗ mê muội'] },
  'yêu': { syllable: 'yêu', hanzi: '妖', pinyin: 'yāo', meanings: ['Yêu quái', 'Kỳ dị quyến rũ khác thường', 'Linh thú thành tinh'] },
  'linh': { syllable: 'linh', hanzi: '灵', pinyin: 'líng', meanings: ['Linh thiêng', 'Linh khí', 'Nhanh nhẹn thông minh', 'Linh hồn'] },
  'đạo': { syllable: 'đạo', hanzi: '道', pinyin: 'dào', meanings: ['Con đường', 'Quy luật thiên địa', 'Chân lý tối thượng', 'Đạo đức'] },
  'chân': { syllable: 'chân', hanzi: '真', pinyin: 'zhēn', meanings: ['Chân thật', 'Bản chất thực sự', 'Thuần túy không pha tạp'] },
  'cực': { syllable: 'cực', hanzi: '极', pinyin: 'jí', meanings: ['Đỉnh điểm', 'Tận cùng tột bực', 'Ranh giới cao nhất'] },
  'vô': { syllable: 'vô', hanzi: '无', pinyin: 'wú', meanings: ['Không có', 'Vô hạn', 'Hư vô không hình không tướng'] },
  'phá': { syllable: 'phá', hanzi: '破', pinyin: 'pò', meanings: ['Phá vỡ', 'Đột phá', 'Làm rách nát khai mở'] },
  'độ': { syllable: 'độ', hanzi: '渡', pinyin: 'dù', meanings: ['Vượt qua sông lớn', 'Cứu vớt cứu độ', 'Vượt kiếp nạn'] },
  'kiếp': { syllable: 'kiếp', hanzi: '劫', pinyin: 'jié', meanings: ['Kiếp nạn', 'Khoảng thời gian dài vô tận', 'Thử thách khắc nghiệt'] },

  // Vũ khí, Công pháp & Bảo vật
  'kiếm': { syllable: 'kiếm', hanzi: '剑', pinyin: 'jiàn', meanings: ['Thanh kiếm hai lưỡi', 'Vua của trăm binh khí'] },
  'đao': { syllable: 'đao', hanzi: '刀', pinyin: 'dāo', meanings: ['Con dao, cây đao một lưỡi bén', 'Bá giả của các binh khí'] },
  'thương': { syllable: 'thương', hanzi: '枪/枪', pinyin: 'qiāng', meanings: ['Ngọn giáo, ngọn thương dài', 'Vua của trận chiến cận chiến'] },
  'cung': { syllable: 'cung', hanzi: '弓', pinyin: 'gōng', meanings: ['Cây cung bắn tên', 'Tầm xa hiểm hóc'] },
  'pháp': { syllable: 'pháp', hanzi: '法', pinyin: 'fǎ', meanings: ['Phương pháp', 'Pháp luật phép thuật', 'Khuôn phép quy củ'] },
  'quyết': { syllable: 'quyết', hanzi: '诀', pinyin: 'jué', meanings: ['Bí quyết', 'Khẩu quyết tu luyện', 'Lời thầm kín ngắn gọn'] },
  'kinh': { syllable: 'kinh', hanzi: '经', pinyin: 'jīng', meanings: ['Kinh điển', 'Sách ghi chép chân lý giáo lý'] },
  'đan': { syllable: 'đan', hanzi: '丹', pinyin: 'dān', meanings: ['Màu đỏ thắm', 'Viên thuốc luyện từ dược thảo', 'Tấm lòng son'] },
  'dược': { syllable: 'dược', hanzi: '药', pinyin: 'yào', meanings: ['Thuốc thang', 'Cây cỏ trị bệnh'] },
  'khí': { syllable: 'khí', hanzi: '气', pinyin: 'qì', meanings: ['Hơi thở', 'Chân khí năng lượng sống', 'Khí chất phong thái'] },
  'bảo': { syllable: 'bảo', hanzi: '宝', pinyin: 'bǎo', meanings: ['Bảo vật', 'Quý báu trân trọng', 'Của cải thần thánh'] },

  // Con người, Thân thể & Tâm tính
  'thân': { syllable: 'thân', hanzi: '身', pinyin: 'shēn', meanings: ['Thân thể nhục thân', 'Bản thân', 'Đời người'] },
  'tâm': { syllable: 'tâm', hanzi: '心', pinyin: 'xīn', meanings: ['Trái tim', 'Tấm lòng tâm trí', 'Nơi khởi nguồn suy nghĩ ý niệm'] },
  'ý': { syllable: 'ý', hanzi: '意', pinyin: 'yì', meanings: ['Ý chí', 'Ý nghĩ hàm nghĩa', 'Nguyện vọng quyết tâm'] },
  'phách': { syllable: 'phách', hanzi: '魄', pinyin: 'pò', meanings: ['Khí phách', 'Phần vía gắn với nhục thân'] },
  'hồn': { syllable: 'hồn', hanzi: '魂', pinyin: 'hún', meanings: ['Linh hồn', 'Phần tinh thần bất diệt'] },
  'cốt': { syllable: 'cốt', hanzi: '骨', pinyin: 'gǔ', meanings: ['Xương cốt', 'Căn cốt tư chất bẩm sinh', 'Khí phách quật cường'] },
  'tủy': { syllable: 'tủy', hanzi: '髓', pinyin: 'suǐ', meanings: ['Tủy xương', 'Phần tinh hoa cốt lõi sâu bên trong'] },
  'huyết': { syllable: 'huyết', hanzi: '血', pinyin: 'xuè', meanings: ['Máu', 'Huyết thống nòi giống', 'Nhiệt huyết'] },

  // Càn khôn & Triết lý
  'càn': { syllable: 'càn', hanzi: '乾', pinyin: 'qián', meanings: ['Trời', 'Quẻ Càn (Dương, sáng sủa, cương kiện)', 'Phương Tây Bắc'] },
  'khôn': { syllable: 'khôn', hanzi: '坤', pinyin: 'kūn', meanings: ['Đất', 'Quẻ Khôn (Âm, mềm mỏng, bao dung)', 'Phương Tây Nam'] },
  'hỗn': { syllable: 'hỗn', hanzi: '混', pinyin: 'hùn', meanings: ['Pha trộn', 'Mờ mịt không phân biệt', 'Hỗn hợp'] },
  'độn': { syllable: 'độn', hanzi: '沌', pinyin: 'dùn', meanings: ['Hỗn độn ngu ngơ', 'Khối nước đục nguyên thủy'] },
  'nguyên': { syllable: 'nguyên', hanzi: '元', pinyin: 'yuán', meanings: ['Khởi đầu', 'Gốc rễ nguyên sơ', 'To lớn bậc nhất'] },
  'anh': { syllable: 'anh', hanzi: '婴', pinyin: 'yīng', meanings: ['Trẻ sơ sinh', 'Hài nhi thanh tịnh'] },
  'trúc': { syllable: 'trúc', hanzi: '筑', pinyin: 'zhù', meanings: ['Xây đắp', 'Kiến tạo nền móng vững bền'] },
  'cơ': { syllable: 'cơ', hanzi: '基', pinyin: 'jī', meanings: ['Căn cứ móng nhà', 'Cơ sở nền tảng'] },
  'hóa': { syllable: 'hóa', hanzi: '化', pinyin: 'huà', meanings: ['Biến hóa', 'Chuyển đổi giáo hóa', 'Tan biến'] },
  'hợp': { syllable: 'hợp', hanzi: '合', pinyin: 'hé', meanings: ['Hợp lại', 'Phù hợp', 'Hòa đồng gom tụ'] },
  'thừa': { syllable: 'thừa', hanzi: '乘', pinyin: 'chéng', meanings: ['Cưỡi lên', 'Vận tải chuyên chở', 'Cảnh giới thâm sâu'] },
  'đại': { syllable: 'đại', hanzi: '大', pinyin: 'dà', meanings: ['To lớn', 'Vĩ đại bao la', 'Rộng khắp'] },
  'luyện': { syllable: 'luyện', hanzi: '炼', pinyin: 'liàn', meanings: ['Rèn luyện nung nấu', 'Tôi luyện gọt giũa'] },
  'đoạt': { syllable: 'đoạt', hanzi: '夺', pinyin: 'duó', meanings: ['Cướp lấy', 'Chiếm đoạt giành giật'] },
  'xá': { syllable: 'xá', hanzi: '舍', pinyin: 'shè', meanings: ['Ngôi nhà', 'Chỗ ở (thân xác được coi là nhà của linh hồn)'] },
  'bế': { syllable: 'bế', hanzi: '闭', pinyin: 'bì', meanings: ['Đóng kín', 'Ngăn cách khóa chặt'] },
  'quan': { syllable: 'quan', hanzi: '关', pinyin: 'guān', meanings: ['Cửa ải', 'Chốt then cài', 'Khớp nối quan hệ'] },
  'lữ': { syllable: 'lữ', hanzi: '侣', pinyin: 'lǚ', meanings: ['Bạn bè đồng hành', 'Người bạn cùng chí hướng'] },
  'chưởng': { syllable: 'chưởng', hanzi: '掌', pinyin: 'zhǎng', meanings: ['Bàn tay', 'Nắm giữ quản lý', 'Chưởng môn'] },
  'quyền': { syllable: 'quyền', hanzi: '拳', pinyin: 'quán', meanings: ['Nắm đấm', 'Quyền thuật quyền cước'] },
  'chỉ': { syllable: 'chỉ', hanzi: '指', pinyin: 'zhǐ', meanings: ['Ngón tay', 'Chỉ điểm dẫn lối'] },
  'bộ': { syllable: 'bộ', hanzi: '步', pinyin: 'bù', meanings: ['Bước chân', 'Thân pháp di chuyển'] },
  'ngộ': { syllable: 'ngộ', hanzi: '悟', pinyin: 'wù', meanings: ['Lĩnh ngộ', 'Giác ngộ đạo lý', 'Hiểu ra chân tướng'] },
  'tính': { syllable: 'tính', hanzi: '性', pinyin: 'xìng', meanings: ['Bản tính', 'Tư chất thiên bẩm'] },
  'duyên': { syllable: 'duyên', hanzi: '缘', pinyin: 'yuán', meanings: ['Cơ duyên', 'Duyên phận kỳ ngộ'] },
  'long': { syllable: 'long', hanzi: '龙', pinyin: 'lóng', meanings: ['Rồng thần', 'Đứng đầu tứ linh', 'Tối cao chí tôn'] },
  'phụng': { syllable: 'phụng', hanzi: '凤', pinyin: 'fèng', meanings: ['Phượng hoàng', 'Thần điểu niết bàn tái sinh'] },
  'hổ': { syllable: 'hổ', hanzi: '虎', pinyin: 'hǔ', meanings: ['Cọp dữ', 'Uy phong lẫm liệt', 'Bạch hổ phương tây'] },
  'đỉnh': { syllable: 'đỉnh', hanzi: '鼎', pinyin: 'dǐng', meanings: ['Cái vạc đồng', 'Đỉnh luyện đan', 'Đỉnh cao tột bực'] },
  'tháp': { syllable: 'tháp', hanzi: '塔', pinyin: 'tǎ', meanings: ['Ngọn tháp', 'Bảo tháp trấn yêu'] },
  'ấn': { syllable: 'ấn', hanzi: '印', pinyin: 'yìn', meanings: ['Con dấu', 'Pháp bảo ấn giám'] },
  'phi': { syllable: 'phi', hanzi: '飞', pinyin: 'fēi', meanings: ['Bay lượn', 'Phi kiếm ngự không'] },
  'sát': { syllable: 'sát', hanzi: '杀', pinyin: 'shā', meanings: ['Giết chóc', 'Sát phạt sát khí'] },
  'sinh': { syllable: 'sinh', hanzi: '生', pinyin: 'shēng', meanings: ['Sinh mệnh', 'Sống còn sinh sôi'] },
  'tử': { syllable: 'tử', hanzi: '死', pinyin: 'sǐ', meanings: ['Cái chết', 'Tử vong tịch diệt'] },
  'vạn': { syllable: 'vạn', hanzi: '万', pinyin: 'wàn', meanings: ['Mười ngàn', 'Vô số kể bao la'] },
  'đế': { syllable: 'đế', hanzi: '帝', pinyin: 'dì', meanings: ['Hoàng đế', 'Đế vương tối cao'] },
  'hoàng': { syllable: 'hoàng', hanzi: '皇', pinyin: 'huáng', meanings: ['Vua chúa', 'Huy hoàng vĩ đại'] },
  'tôn': { syllable: 'tôn', hanzi: '尊', pinyin: 'zūn', meanings: ['Tôn kính', 'Chí tôn tôn quý'] },
  'chủ': { syllable: 'chủ', hanzi: '主', pinyin: 'zhǔ', meanings: ['Chủ nhân', 'Làm chủ thống trị'] }
};

/**
 * Remove Vietnamese accents and punctuation for normalized matching
 */
export function normalizeSyllable(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'<>\[\]]/g, '');
}

/**
 * Main Lookup function: searches for compound terms and breaks down syllables
 */
export function lookupHanViet(rawQuery: string): HanVietLookupResult {
  const query = rawQuery.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'<>\[\]]/g, '');
  const lowerQuery = query.toLowerCase();

  // 1. Direct Term Match
  const termMatch = NOVEL_TERMS.find(
    (t) => t.term.toLowerCase() === lowerQuery
  );

  // 2. Character-by-character Morpheme Breakdown
  const words = query.split(/\s+/).filter(Boolean);
  const characterMatches: HanVietCharacter[] = [];

  for (const word of words) {
    const norm = normalizeSyllable(word);
    if (HAN_VIET_SYLLABLES[norm]) {
      characterMatches.push(HAN_VIET_SYLLABLES[norm]);
    }
  }

  // 3. Related / Similar Terms (partial match or same category)
  const relatedTerms = NOVEL_TERMS.filter((t) => {
    if (termMatch && t.term === termMatch.term) return false;
    const termLower = t.term.toLowerCase();
    // If query matches part of term or term matches part of query
    if (termLower.includes(lowerQuery) || lowerQuery.includes(termLower)) return true;
    // Or if they share syllables
    return words.some((w) => termLower.includes(normalizeSyllable(w)));
  }).slice(0, 4);

  return {
    query,
    termMatch,
    characterMatches,
    relatedTerms
  };
}
